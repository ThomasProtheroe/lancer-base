const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const logger = fs.createWriteStream('logs/activity.log', {
    flags: 'a'
});

const baseData = require('./public/data/base.json');
const pilotData = require("./public/data/characters");
//We're using comp/con pilot data, so need to add downtime property if it's the first time being loaded
for (const [key, pilot] of Object.entries(pilotData)) {
    if (!("downtimeUnits" in pilot)) {
        pilot['downtimeUnits'] = 0;
        fs.writeFile(`/public/data/characters/${pilot['callsign']}.json`, JSON.stringify(pilot), 'utf8', () => {});
        console.log(`Character missing downtime stat, adding: ${pilot['callsign']}`);
    }
}


//Main application routes
app.post('/update/base', function (req, res) {
    console.log('update base request');
    const params = {
        "action": req.body.action,
        "resources": req.body.resources,
        "addon": req.body.addon,
        "pilot": req.body.pilot
    }

    updateBase(params);
    
    res.send({
        'newBase': baseData,
        'status': 'success',
    });
});
app.post('/update/pilot', function (req, res) {
    console.log('update pilot request');
    const params = {
        "pilot": req.body.pilot
    }

    updatePilot(params);

    logger.write('Pilot was updated');
    res.send({
        'newPilot': pilotData[params['pilot']],
        'status': 'success',
    });
});

//Resource routes (styles, images, data objects etc)
app.get('/data/baseData', function(req, res) {
    res.send(baseData);
});
app.get('/data/pilotData', function(req, res) {
    res.send(pilotData);
});
app.use(express.static(path.join(__dirname, 'public')));

app.listen(9000, function () {
    console.log('LancerBase listening on port 9000');
});

const updateBase = (params) => {
    switch (params['action']) {
        case 'buyAddon':
            baseData['resources'] = params['resources'];
            baseData[params['addon']['family']].push(params['addon']);
            
            logger.write(params['pilot'] + ' purchased a new addon: ' + params['addon']['name'] + '\n');
            break;
        case 'workAddon':
            let timeRemaining = params['addon']['timeRemaining'] - 1;
            params['addon']['timeRemaining'] = timeRemaining;

            updateAddon(params['addon']);

            if (timeRemaining === 0) {
                logger.write(params['pilot'] + ' finished work on : ' + params['addon']['name'] + '\n');
            } else {
                logger.write(params['pilot'] + ' worked on : ' + params['addon']['name'] + '\n');
            }
            break;
        case 'salvage':
            baseData['resources'] = params['resources'];

            logger.write(params['pilot'] + ' explored more of the facility and salvaged some resources: ' + getResourcesString(params['resources']) + '\n');
            break;
        default:
            break;
    }

    // Yeah no validation callback right now, get over it
    fs.writeFile('public/data/base.json', JSON.stringify(baseData), 'utf8', () => {});
}

const updatePilot = (params) => {
    pilotData[params['pilot']['callsign']] = params['pilot'];

    // Yeah no validation callback right now, get over it
    fs.writeFile('data/characters/' + params['pilot']['callsign'] + '.json', JSON.stringify(pilotData[params['pilot']['callsign']]), 'utf8', () => {});
}

const getResourcesString = (resources) => {
    let output = '';
    for (const [key, resource] of Object.entries(resources)) {
        output += resource['name'] + ' - ' + resource['quantity'] + ' ';
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