const fs = require('fs');
const path = require('path');

const express = require('express');
const sharp = require('sharp');
const storage = require('node-persist');
const glob = require('glob');

storage.initSync();
storage.get = storage.getItemSync;
storage.set = storage.setItemSync;
const app = express();

const cfg  = require(path.join(__dirname, '../config.json'));
const supportedInputExtensions = ['jpg', 'jpeg', 'png', 'gif'];

const Cache = {};
const cacheDir = path.join(__dirname, '../cache/');

console.log('Configuration:', JSON.stringify(cfg, null, '  '));

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

app.get('/', function (req, res) {
    res.send('Hello World!')
})

app.get('/img/:size/*', function (req, res) {
    console.log('REQUEST:', JSON.stringify(req.params, null, '  '));
    console.log('QUERY:', JSON.stringify(req.query, null, '  '));

    let size = req.params.size;
    let file = req.params[0].split('.');
    let extension = file.pop();
    file = file.join('.');

    if (!cfg.imagesizes[size]) {
        // we are not allowed to resize the image
        return res.status(400).end(); // bad request
    }

    // check if file is available
    if (Cache[file]) {
        // it is!
        if (!Cache[file].sizes[size] || !Cache[file].sizes[size][extension]) {
            if (!Cache[file].sizes[size]) Cache[file].sizes[size] = {};
            if (!Cache[file].sizes[size][extension]) Cache[file].sizes[size][extension] = {};

            let newFilename = [Date.now(), size, file.replace(/\//g, '_')].join('-') + '.' + extension;

            let resized = sharp(path.join(__dirname, '../img/', Cache[file].file + '.' + Cache[file].extension))
            .resize(+size.split('x')[0] || null, +size.split('x')[1] || null);

            if (sharp()[extension]) resized = resized[extension]();

            resized.toFile(cacheDir + newFilename, (err, info) => {
                if (err) return console.log('SAVE ERROR', err);



                Cache[file].sizes[size][extension].file = newFilename;
                saveImageToStorage(file);

                return serveImage(res, file, size, extension);
            });
        } else {
            return serveImage(res, file, size, extension);
        }
    } else {
        // no file found => 404 error
        return res.status(404).end(); // not found
    }
})

// warmup cache here
// => get all images in source directory and add them to memory
glob(`img/**/*.{${supportedInputExtensions.join(',')}}`, function (er, files) {
    files = files.map(f => f.replace('img/', ''));

    files.forEach((f) => {
        let file = f.split('.');
        let extension = file.pop();
        file = file.join('.');

        if (!storage.get(file)) {
            Cache[file] = {
                extension,
                file,
                sizes: {}
            };

            saveImageToStorage(file);
        } else {
            Cache[file] = storage.get(file);
        }
    });

    console.log('Cache:', JSON.stringify(Cache, null, '  '));

    app.listen(3000, function () {
        console.log('Example app listening on port 3000!')
    })
});

function serveImage(res, file, size, extension) {
    Cache[file].sizes[size][extension].lastRequested = Date.now();
    saveImageToStorage(file);
    res.type(extension);
    console.log('Cache:', JSON.stringify(Cache, null, '  '));
    return res.sendFile(path.join(cacheDir, Cache[file].sizes[size][extension].file));
}

function saveImageToStorage(file) {
    storage.set(file, Cache[file]);
}
