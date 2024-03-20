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
    updateBase();

    res.send({
        'status': 'success',
    });
});

//Resource routes (styles, images, data objects etc)
app.get('/data/baseData', function(req, res) {
    console.log(baseData);
    res.send(baseData);
});
app.get('/styles.css', function (req, res) {
    res.sendFile(path.join(__dirname,"/styles.css"));
});
app.get('/images/:filename', function (req, res) {
    res.sendFile(path.join(__dirname,"/images/" + req.params['filename']));
});
app.get('/data/:filename', function (req, res) { //TODO: cache the contents of the data files and send from cache
    res.sendFile(path.join(__dirname,"/data/" + req.params['filename']));
});


app.listen(9000, function () {
    console.log('LancerBase listening on port 9000');
});


const updateBase = () => {
    return;
}