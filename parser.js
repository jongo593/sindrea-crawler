const Json2csvParser = require('json2csv').Parser;
const _ = require('lodash');

function json2csv(jsonArray) {
    let longest = {};

    _.forEach(jsonArray, (res, i) => {
        if(_.keys(res).length > _.keys(longest).length) {
            longest = res;
        }
    });

    return new Json2csvParser({fields: _.keys(longest)}).parse(jsonArray);
}

module.exports = {
    json2csv
};
