import express from 'express';
const app = express();
import http from 'http';
const server = http.createServer(app);

import { Server } from 'socket.io';
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
import { engine } from 'express-handlebars';
app.engine('hbs', engine({ extname: '.hbs' }));
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
try {
	baseData = JSON.parse(await fs.readFile('./public/data/base.json'));
} catch (e) {
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

import { ActivityLog } from './src/ActivityLog.mjs';
const activityLogger = new ActivityLog('logs/activity_log.json', io);
await activityLogger.load();

import { PilotGateway } from './src/PilotGateway.mjs';
const pilots = new PilotGateway('public/data/pilots.json', activityLogger);
await pilots.load();

// API Routes

// Logs
app.post('/log', (req, res) => {
	const { user, message } = req.body;
	const log = activityLogger.createLog(user, message);
	res.send(log);
});
app.get('/log', (req, res) => {
	const activityLogs = activityLogger.listLogs();
	res.send(activityLogs);
});

// Pilots
app.get('/pilots', function (req, res) {
	res.send(pilots.listPilots());
});
app.get('/pilots/:pilotId', function (req, res) {
	const pilotId = req.params.pilotId;
	res.send(pilots.getPilot(pilotId));
});
app.put('/pilots', function (req, res) {
	const pilotId = req.body.pilotId;
	const pilotData = req.body.pilot;

	const updatedPilot = pilots.updatePilot(pilotId, pilotData);

	res.send({
		'newPilot': updatedPilot,
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
		'newPilots': pilots.listPilots(),
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
	res.send({ status: 200 });
})

// Static content
app.use(express.static(path.join(__dirname, 'public')));

server.listen(9000, function () {
	console.log('LancerBase listening on port 9000');
});

async function updateBase(params) {
	const pilotId = params.pilot;
	const pilotData = pilots.getPilot(pilotId);
	const addon = params.addon;
	switch (params['action']) {
		case 'buyAddon':
			baseData.resources = params.resources;
			updateResources(baseData.resources);
			baseData[addon.family].push(addon);

			activityLogger.createLog(pilotId, `purchased a new addon ${addon.name}`);
			break;
		case 'workAddon':
			//Validate the pilot has enough downtime remaining
			if (pilotData.downtimeUnits <= 0) {
				console.log(pilotId + ' tried to add work to an addon, but has no downtime remaining.');
				break;
			}

			pilotData.downtimeUnits--;

			const timeRemaining = addon.timeRemaining - 1;
			addon.timeRemaining = timeRemaining;

			updateAddon(addon);
			pilots.updatePilot(pilotId, pilotData);

			activityLogger.createLog(pilotId, `${timeRemaining ? 'worked on' : 'finished work on'} ${addon.name}`);
			break;
		case 'performActivity':
			const activity = getActivityByName(params.activity);
			const newActivity = JSON.parse(JSON.stringify(activity));

			if (pilotData.downtimeUnits < newActivity.cost.downtimeUnits) {
				console.log(pilotId + ' tried to perform an activity, but has no downtime remaining.');
				break;
			}
			if (newActivity.cost.materials > 0) {
				if (baseData.resources.materials.quantity < newActivity.cost.materials) {
					console.log(pilotId + ' tried to perform an activity, but could not afford materials.');
					break;
				}
				baseData.resources.materials.quantity -= newActivity.cost.materials;
				updateResources(baseData.resources);
			}

			//Determine resource gain/loss
			if (activity.effects.resources) {
				const modifierMax = activity.effects.resources.modifierPercent;
				for (const [resource, quantity] of Object.entries(activity.effects.resources.quantities)) {
					const modifier = (Math.floor(Math.random() * (modifierMax + 1))) / 100;
					const sign = Math.random() < 0.5 ? 1 : -1;
					const amount = Math.round(quantity * (1 + (sign * modifier)));

					baseData.resources[resource].quantity += amount;
					newActivity.effects.resources.quantities[resource] = amount;
				}
				updateResources(baseData.resources);
			}

			//Build mechs
			if (activity.effects.mech) {
				const mechPrinter = baseData.facilities.filter((facility) => facility.type == 'printer');
				const flaws = [];
				for (let i = 0; i < mechPrinter[0].flaws; i++) {
					flaws.push(getRandomTrait('flaws'));
				}
				newActivity.flaws = flaws;
			}

			//ToDo - other effects

			//Downtime costs
			pilotData.downtimeUnits -= newActivity.cost.downtimeUnits;
			pilots.updatePilot(pilotId, pilotData);

			//Results output
			const outputString = getActivityEffectsString({ activity: newActivity, pilot: pilotId });
			activityLogger.createLog(pilotId, outputString);
			break;
		default:
			break;
	}

	// Yeah no validation callback right now, get over it
	try {
		await fs.writeFile('./public/data/base.json', JSON.stringify(baseData, null, '	'), 'utf8');
	} catch (err) {
		console.log(err);
	}
}

function updateResources(resources) {
	io.emit('resources', resources);
}

function getResourcesString(resources) {
	return Object.entries(resources).reduce((acc, [key, resource]) => acc += `${key} - ${resource} `, 'Resources gained: ');
}

function getActivityByName(name) {
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
	const addOnType = newAddon['family'];
	const addonIndex = baseData[addOnType].findIndex((baseAddon) => baseAddon.name === newAddon.name);
	if (addonIndex > -1) {
		baseData[addOnType][addonIndex] = newAddon;
	}
}