import express from 'express';
const app = express();
import http from 'http';
const server = http.createServer(app);

import {Server} from 'socket.io';
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'node:fs/promises';

// These aren't defined in the ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup view engine
import {engine} from 'express-handlebars';
app.engine('hbs', engine({extname: '.hbs'}));
app.set('view engine', '.hbs');
app.set('views', './views');

// Markdown parsing tools
import matter from 'gray-matter';
import markdownit from 'markdown-it';

// Cache lancer base data
import baseData from './public/data/base.json' with {type: 'json'};
import pilotData from './public/data/pilots.json' with {type: 'json'};
import mechTraitsData from './public/data/traits.json' with {type: 'json'};
import logs from './logs/activity_log.json' with {type: 'json'};

//Blog route
app.get('/blog/:article', (req, res) => {
	const file = matter.read(`${__dirname}/blog/${req.params.article}.md`);
	
	const md = markdownit();
	const content = file.content;
	const result = md.render(content);
	
	res.render('post', {
		post: result,
		title: file.data.title,
		description: file.data.description,
		image: file.data.image
	});
});

//Main application routes
app.post('/update/base', function (req, res) {
	console.log('update base request');
	const params = {
		"action": req.body.action,
		"resources": req.body.resources,
		"addon": req.body.addon,
		"activity": req.body.activity,
		"pilot": req.body.pilot
	}

	updateBase(params);

	res.send({
		'newBase': baseData,
		'newPilots': pilotData,
		'status': 'success',
	});
});
app.post('/update/pilot', function (req, res) {
	console.log('update pilot request');
	const params = {
		"pilot": req.body.pilot
	}

	updatePilot(params);

	writeLog(params.pilot, ' was updated');

	res.send({
		'newPilot': pilotData[params['pilot']],
		'status': 'success',
	});
});

//Resource routes (styles, images, data objects etc)
app.get('/data/baseData', function (req, res) {
	res.send(baseData);
});
app.get('/data/pilotData', function (req, res) {
	res.send(pilotData);
});
app.post('/log', (req, res) => {
	const {user, message} = req.body;
	writeLog(user, message);
	res.send({'status': 'success'});
});
app.get('/log', (req, res) => {
	res.send(logs);
});

app.use(express.static(path.join(__dirname, 'public')));

server.listen(9000, function () {
	console.log('LancerBase listening on port 9000');
});

const updateBase = async (params) => {
	switch (params['action']) {
		case 'buyAddon':
			baseData.resources = params.resources;
			updateResources(baseData.resources);
			baseData[params.addon.family].push(params.addon);

			writeLog(params.pilot, `purchased a new addon ${params.addon.name}`);
			break;
		case 'workAddon':
			//Validate the pilot has enough downtime remaining
			if (pilotData[params['pilot']]['downtimeUnits'] <= 0) {
				console.log(params['pilot'] + ' tried to add work to an addon, but has no downtime remaining.');
				break;
			}

			let updatedPilot = pilotData[params['pilot']];
			updatedPilot['downtimeUnits']--;
			let timeRemaining = params['addon']['timeRemaining'] - 1;
			params['addon']['timeRemaining'] = timeRemaining;

			updateAddon(params['addon']);
			updatePilot({ 'pilot': updatedPilot });

			writeLog(params.plot, `${timeRemaining ? 'worked on' : 'finished work on'} ${params.addon.name}`);
			break;
		case 'performActivity':
			const activity = getActivityByName(params.activity);
			const newActivity = JSON.parse(JSON.stringify(activity));

			if (pilotData[params.pilot].downtimeUnits < newActivity.cost.downtimeUnits) {
				console.log(params.pilot + ' tried to perform an activity, but has no downtime remaining.');
				break;
			}
			if (newActivity.cost.materials > 0) {
				if (baseData.resources.materials.quantity < newActivity.cost.materials) {
					console.log(params.pilot + ' tried to perform an activity, but could not afford materials.');
					break;
				}
				baseData.resources.materials.quantity -= newActivity.cost.materials;
				updateResources(baseData.resources);
			}

			//Determine resource gain/loss
			if (activity.effects.resources) {
				const modifierMax = activity.effects.resources.modifierPercent;
				for (const [resource, quantity] of Object.entries(activity.effects.resources.quantities)) {
					const modifier = Math.floor(Math.random() * modifierMax);
					if (Math.random() < 0.5) {
						amount = Math.round(quantity * (1 + (modifier / 100)));
					} else {
						amount = Math.round(quantity * (1 - (modifier / 100)));
					}

					baseData['resources'][resource]['quantity'] += amount;
					newActivity['effects']['resources']['quantities'][resource] = amount;
				}
				updateResources(baseData.resources);
			}

            //Build mechs
            if (activity['effects']['mech']) {
                const mechPrinter = baseData['facilities'].filter((facility) => facility.type == 'printer');
                const flaws = [];
                for (let i = 0; i < mechPrinter[0].flaws; i++) {
                    flaws.push(getRandomTrait('flaws'));
                }
                newActivity['flaws'] = flaws;
            }

			//ToDo - other effects


			//Downtime costs
			pilotData[params['pilot']]['downtimeUnits'] -= newActivity['cost']['downtimeUnits'];
			updatePilot({ 'pilot': pilotData[params['pilot']] });

			//Results output
			const outputString = getActivityEffectsString({ "activity": newActivity, "pilot": params['pilot'] });
			writeLog(params.pilot, outputString);
			break;
		default:
			break;
	}

	// Yeah no validation callback right now, get over it
	try {
		await fs.writeFile('./public/data/base.json', JSON.stringify(baseData, null, "    "), 'utf8');
	} catch (err) {
		console.log(err);
	}
}

function updateResources(resources) {
	io.emit('resources', resources);
}

async function writeLog(user, message){
	
	const log = {
		user: user,
		time: Date.now(),
		message: `${message}`
	};
	logs.push(log);
	io.emit('activity_log', log);
	try {
		await fs.writeFile('./logs/activity_log.json', JSON.stringify(logs, null, "    "));
	} catch (err) {
		console.log('error: ', err);
		console.log('Failed to write logs to file, dumping contents');
		console.log(logs);
	}
}

const updatePilot = async (params) => {
	pilotData[params['pilot']['callsign']] = params['pilot'];

	// Yeah no validation callback right now, get over it
	try {
		await fs.writeFile('./public/data/pilots.json', JSON.stringify(pilotData, null, "    "), 'utf8');
	} catch (err) {
		console.log(err);
	};
}

const getResourcesString = (resources) => {
	let output = 'Resources gained: ';
	for (const [key, resource] of Object.entries(resources)) {
		output += key + ' - ' + resource + ' ';
	}
	return output;
}

const getActivityByName = (name) => {
	let targetActivity = null;
	baseData['activities'].forEach((activity) => {
		if (activity['name'] === name) {
			targetActivity = activity;
		}
	});
	return targetActivity;
}

const getActivityEffectsString = (params) => {
	let effects = params['activity']['effects'];
	let output = `${effects['description']}\n`;
	if (effects['resources']) {
		output += `${params['pilot']} ${effects['resources']['description']}\n`;
		output += `${getResourcesString(effects['resources']['quantities'])}\n`;
	}

    if (effects['mech']) {
        output += 'A new mech was produced with the following traits:';
        if (params['activity']['flaws']) {
            output += `Flaws: `
            params['activity']['flaws'].forEach((flaw) => {
                output += `${flaw['name']}: ${flaw['effect']}`;
            });
        }
        if (params['activity']['qualities']) {
            output += `Qualities: `
            params['activity']['qualities'].forEach((quality) => {
                output += `${quality['name']}: ${quality['effect']}`;
            });
        }
    }

	return output;
}

const getRandomTrait = (type) => {
    const weightedTraits = [];
    for (let traitIndex = 0; traitIndex < mechTraitsData[type].length; traitIndex++) {
        for (let addIndex = 0; addIndex < mechTraitsData[type][traitIndex].weight; addIndex++) {
            weightedTraits.push(mechTraitsData[type][traitIndex]);
        }
    }
    return weightedTraits[Math.floor(Math.random() * weightedTraits.length)];
}

const updateAddon = (newAddon) => {
	for (let i = 0; i < baseData[newAddon['family']].length; i++) {
		if (baseData[newAddon['family']][i]['name'] === newAddon['name']) {
			baseData[newAddon['family']][i] = newAddon;
		}
	}
}