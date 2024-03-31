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

// Load and Cache lancer base data
let mechTraitsData;
try {
	mechTraitsData = JSON.parse(await fs.readFile('./public/data/traits.json'));
} catch (e) {
	console.error(e);
}

let baseData;
try{
	baseData = JSON.parse(await fs.readFile('./public/data/base.json'));
} catch(e) {
	if (e.code === 'ENOENT') {
		console.log('No Base data was detected, generating default Base data');
		const defaultBaseData = await fs.readFile('./data/base_default.json');
		await fs.writeFile('./public/data/base.json', defaultBaseData);
		baseData = JSON.parse(defaultBaseData);
	} else {
		console.log('unexpected error');
		console.error(e);
		process.exit(1);
	}
}

let pilotData;
try{
	pilotData = JSON.parse(await fs.readFile('./public/data/pilots.json'));
} catch(e) {
	if (e.code === 'ENOENT') {
		console.log('No Pilots data was detected, generating default Pilots data');
		const defaultPilotsData = await fs.readFile('./data/pilots_default.json');
		await fs.writeFile('./public/data/pilots.json', defaultPilotsData);
		pilotData = JSON.parse(defaultPilotsData);
	} else {
		console.log('unexpected error');
		console.error(e);
		process.exit(1);
	}
}

let logs;
try {
	logs = JSON.parse(await fs.readFile('./logs/activity_log.json'));
} catch(e) {
	if (e.code === 'ENOENT') {
		console.log('No Activity Log detected, generating default Activity Log');
		await fs.writeFile('./logs/activity_log.json', JSON.stringify([], null, '	'));
		logs = [];
	} else {
		console.log('unexpected error');
		console.error(e);
		process.exit(1);
	}
}

// API Routes

// Logs
app.post('/log', (req, res) => {
	const {user, message} = req.body;
	const log = writeLog(user, message);
	res.send(log);
});
app.get('/log', (req, res) => {
	res.send(logs);
});

// Pilots
app.get('/pilots', function (req, res) {
	res.send(pilotData);
});
app.get('/pilots/:pilot_id', function (req, res) {
	const pilot_id = req.params.pilot_id;
	// TODO add longer form pilot data
	res.send(pilotData[pilot_id]);
});
app.put('/pilots', function (req, res) {
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

// Base
app.get('/base', function (req, res) {
	res.send(baseData);
});
app.put('/base', function (req, res) {
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

//Dynamic content
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

app.get('/blog', (req, res) => {
	// TODO add view to show summarized view of all mission notes
	res.send({status: 200});
})

// Static content
app.use(express.static(path.join(__dirname, 'public')));

server.listen(9000, function () {
	console.log('LancerBase listening on port 9000');
});

async function updateBase(params) {
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

			const updatedPilot = pilotData[params['pilot']];
			updatedPilot['downtimeUnits']--;
			const timeRemaining = params['addon']['timeRemaining'] - 1;
			params['addon']['timeRemaining'] = timeRemaining;

			updateAddon(params['addon']);
			updatePilot({ 'pilot': updatedPilot });

			writeLog(params.pilot, `${timeRemaining ? 'worked on' : 'finished work on'} ${params.addon.name}`);
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
					const modifier = (Math.floor(Math.random() * (modifierMax + 1)))/100;
					const sign = Math.random() < 0.5 ? 1 : -1;
					const amount = Math.round(quantity * (1 + (sign * modifier)));

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
	return log;
}

async function updatePilot(params) {
	pilotData[params['pilot']['callsign']] = params['pilot'];

	// Yeah no validation callback right now, get over it
	try {
		await fs.writeFile('./public/data/pilots.json', JSON.stringify(pilotData, null, "    "), 'utf8');
	} catch (err) {
		console.log(err);
	};
}

function getResourcesString(resources) {
	return Object.entries(resources).reduce((acc, [key, resource])=> acc += `${key} - ${resource} `, 'Resources gained: ');
}

function getActivityByName(name){
	return baseData.activities.find((activity) => activity.name === name);
}

function getActivityEffectsString(params) {
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

function getRandomTrait(type) {
    const weightedTraits = [];
    for (let traitIndex = 0; traitIndex < mechTraitsData[type].length; traitIndex++) {
        for (let addIndex = 0; addIndex < mechTraitsData[type][traitIndex].weight; addIndex++) {
            weightedTraits.push(mechTraitsData[type][traitIndex]);
        }
    }
    return weightedTraits[Math.floor(Math.random() * weightedTraits.length)];
}

function updateAddon(newAddon) {
	const addOnType =  newAddon['family'];
	const addonIndex = baseData[addOnType].findIndex((baseAddon) => baseAddon.name === newAddon.name);
	if (addonIndex > -1) {
		baseData[addOnType][addonIndex] = newAddon;
	}
}