import express from 'express';
const app = express();
import http from 'http';
const server = http.createServer(app);
import proxy from 'express-http-proxy';

import { Server } from 'socket.io';
const io = new Server(server);

const TTS_SERVER_URL = 'http://localhost:9600';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/tts', proxy(TTS_SERVER_URL));

import path from 'path';
import * as fs from 'node:fs/promises';

// These aren't defined in the ES module scope
const __dirname = import.meta.dirname;

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

// Load zen dashboard data
let zenData;
try {
	zenData = JSON.parse(await fs.readFile('./public/data/zen.json'));
} catch (e) {
	console.error(e);
}

import { ActivityLog } from './src/ActivityLog.mjs';
const activityLogger = new ActivityLog('logs/activity_log.json', io);
await activityLogger.load();

import { PilotGateway } from './src/PilotGateway.mjs';
const pilots = new PilotGateway('public/data/pilots.json', activityLogger);
await pilots.load();

import { Base } from './src/Base.mjs';
const lancerBase = new Base('Blue Haven', io);
await lancerBase.load();

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

// Zen
app.get('/zen', function (req, res) {
	res.send(zenData);
});
app.post('/zen/activate', async function (req, res) {
	const abilityCost = req.body.cost;
	const updatedIdentity = zenData.identity - abilityCost;

	zenData.identity = updatedIdentity;

	try{
		await fs.writeFile('public/data/zen.json', JSON.stringify(zenData, null, '	'), 'utf8');
		io.emit('zen_update', zenData);
		res.send(zenData);
	} catch(err) {
		console.error(err);
		res.status(500);
		res.send(new Error('Failed to save Zen Data'));
	}

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
	res.send(lancerBase);
});
app.patch('/base', async(req, res) => {
	const {
		defenses,
		condition,
		morale,
		resources,
		addons
	} = req.body;

	if (defenses) {
		lancerBase.updateDefenses(defenses);
	}
	if (Number.isInteger(condition)) {
		lancerBase.updateCondition(condition);
	}
	if (Number.isInteger(morale)) {
		lancerBase.updateMorale(morale);
	}
	if (resources) {
		lancerBase.updateResources(resources);
	}
	if (addons) {
		addons.map((addon) => {
			// try to add the addon
			if(!lancerBase.addAddon(addon)) {
				// if it already exists try updating it instead
				lancerBase.updateAddon(addon);
			}
		});
	}

	await lancerBase.save();

	res.send(lancerBase); 

});
// call this if changes are made to the base data file outside the server
app.post('/base/refresh', async (req, res) => {
	await lancerBase.load();
	res.send(lancerBase);
});
app.post('/base/:action', function (req, res) {
	const params = {
		"action": req.params.action,
		"resources": req.body.resources,
		"addon": req.body.addon,
		"activity": req.body.activity,
		"pilot": req.body.pilot
	}

	updateBase(params);

	res.send({
		'newBase': lancerBase,
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

app.post('/reloadPage', async (req, res) => {
	io.emit('reloadPage');
	res.send({ status: 200 });
});

// ZEN
app.post('/gm/broadcastSound', (req, res) => {
	const filePath = req.body.filePath;
	io.emit('gm_sound', filePath);
	res.send({ status: 200 });
});

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
			lancerBase.updateResources(params.resources);
			lancerBase.addAddon(addon);

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

			lancerBase.updateAddon(addon);
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
				if (lancerBase.resources.materials.quantity < newActivity.cost.materials) {
					console.log(pilotId + ' tried to perform an activity, but could not afford materials.');
					break;
				}
				const updatedResource = {};
				updatedResource.materials = lancerBase.resources.materials.quantity - newActivity.cost.materials;
				lancerBase.updateResources(updatedResource);
			}

			//Determine resource gain/loss
			if (activity.effects.resources) {
				const updatedResource = {};
				const modifierMax = activity.effects.resources.modifierPercent;
				for (const [resource, quantity] of Object.entries(activity.effects.resources.quantities)) {
					const modifier = (Math.floor(Math.random() * (modifierMax + 1))) / 100;
					const sign = Math.random() < 0.5 ? 1 : -1;
					const amount = Math.round(quantity * (1 + (sign * modifier)));

					updatedResource[resource] = lancerBase.resources[resource].quantity + amount;
					newActivity.effects.resources.quantities[resource] = amount;
				}
				lancerBase.updateResources(updatedResource);
			}

			//Build mechs
			if (activity.effects.mech) {
				const mechPrinter = lancerBase.addons.filter((addon) => addon.type === 'printer');
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
		await lancerBase.save();
	} catch (err) {
		console.log(err);
	}
}

function getResourcesString(resources) {
	return Object.entries(resources).reduce((acc, [key, resource]) => acc += `${key} - ${resource} `, 'Resources gained: ');
}

function getActivityByName(name) {
	return lancerBase.addons.find((activity) => activity.category === 'activity' && activity.name === name);
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
