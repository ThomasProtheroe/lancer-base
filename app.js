var express = require('express');
var app = express();
var path = require('path');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Main application routes
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname,"/pages/base.html"));
});
app.post('/update/base', function (req, res) {
    console.log('update request');
    console.log(req);
    updateBase();

    res.send({
        'status': 'success',
    });
});

//Resource routes (styles, images, data objects etc)
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



const updateBase = () => {
    return;
}