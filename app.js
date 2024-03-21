var express = require('express');
var app = express();
var path = require('path');
var fs = require('fs');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let baseData = {};
baseData = require('./data/base.json');

//Main application routes
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname,"/pages/base.html"));
});
app.post('/update/base', function (req, res) {
    console.log('update request');
    const params = {
        "resources": req.body.resources,
        "addon": req.body.addon
    }

    updateBase(params);

    res.send({
        'status': 'success',
    });
});

//Resource routes (styles, images, data objects etc)
app.get('/data/baseData', function(req, res) {
    res.send(baseData);
});
app.get('/styles.css', function (req, res) {
    res.sendFile(path.join(__dirname,"/styles.css"));
});
app.get('/images/:filename', function (req, res) {
    res.sendFile(path.join(__dirname,"/images/" + req.params['filename']));
});
app.get('/data/:filename', function (req, res) {
    res.sendFile(path.join(__dirname,"/data/" + req.params['filename']));
});


app.listen(9000, function () {
    console.log('LancerBase listening on port 9000');
});


const updateBase = (params) => {
    baseData['resources'] = params['resources'];
    baseData[params['addon']['family']].push(params['addon']);

    // Yeah no validation callback right now, get over it
    fs.writeFile('data/base.json', JSON.stringify(baseData), 'utf8', () => {});
}