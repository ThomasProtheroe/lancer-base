var express = require('express');
var app = express();
var path = require('path');

//Main application route
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname,"/pages/base.html"));
});

//Resource routes (images, data objects etc)
app.get('/images/:filename', function (req, res) {
    res.sendFile(path.join(__dirname,"/images/" + req.params['filename']));
});
app.get('/data/:filename', function (req, res) {
    console.log('json request');
    res.sendFile(path.join(__dirname,"/data/" + req.params['filename']));
});

app.listen(9000, function () {
    console.log('LancerBase listening on port 9000');
});