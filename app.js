const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const {Server} = require('socket.io');
const io = new Server(server);

const path = require('path');
const fs = require('fs').promises;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const baseData = require('./public/data/base.json');
const pilotData = require("./public/data/pilots.json");
const logs = require('./logs/activity_log.json');

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
		await fs.writeFile('./public/data/base.json', JSON.stringify(baseData), 'utf8');
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
		await fs.writeFile('./logs/activity_log.json', JSON.stringify(logs));
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
		await fs.writeFile('./public/data/pilots.json', JSON.stringify(pilotData), 'utf8');
	} catch (err) {
		console.log(err);
	};
}

const getResourcesString = (resources) => {
	let output = 'Resources gained: ';
	console.log(resources);
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

	return output;
}

const updateAddon = (newAddon) => {
	for (let i = 0; i < baseData[newAddon['family']].length; i++) {
		if (baseData[newAddon['family']][i]['name'] === newAddon['name']) {
			baseData[newAddon['family']][i] = newAddon;
		}
	}
}