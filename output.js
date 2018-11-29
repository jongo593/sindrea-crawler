const fs = require('fs');
const path = require('path');

function _writeHandler(resolve, reject) {
    return err => {
        if(err) {
            reject(err);
        } else {
            resolve();
        }
    }
}

function write(dest, content) {
    return new Promise((resolve, reject) => {
        if(!content) {
            content = '';
        }
        _ensureDirectoryExistence(dest);
        fs.writeFile(dest, content, _writeHandler(resolve, reject))
    });
}

function _ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    _ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

module.exports = {
    write,
    _writeHandler,
    _ensureDirectoryExistence
};
