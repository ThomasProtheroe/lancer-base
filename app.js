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
const pilotData = require("./data/characters");

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
    if (params['action'] == 'buyAddon') {
        if (params['resources']) {
            baseData['resources'] = params['resources'];
        }
        if (params['addon']) {
            baseData[params['addon']['family']].push(params['addon']);
        }
        logger.write(params['pilot'] + ' purchased a new addon: ' + params['addon']['name'] + '\n');
    }

    // Yeah no validation callback right now, get over it
    fs.writeFile('public/data/base.json', JSON.stringify(baseData), 'utf8', () => {});
}

const updatePilot = (params) => {
    pilotData[params['pilot']['callsign']] = params['pilot'];

    // Yeah no validation callback right now, get over it
    fs.writeFile('data/characters/' + params['pilot']['callsign'] + '.json', JSON.stringify(pilotData[params['pilot']['callsign']]), 'utf8', () => {});
}