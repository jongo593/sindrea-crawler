const puppeteer = require('puppeteer');
const _ = require('lodash');
const path = require('path');
const output = require('./output');
const parser = require('./parser');
const axios = require('axios');
const HUNTER_API_KEY = 'b55f3b1e3a34d528b65af3332efcb2f4acdd657c';
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};
const processArray = (array, fn) => {
    var results = [];
    return array.reduce(function(p, item, i) {
        return p.then(function() {
            return fn(item, i).then(function(data) {
                results.push(data);
                return results;
            });
        });
    }, Promise.resolve());
};
function extractHostname(url) {
    var hostname;
    //find & remove protocol (http, ftp, etc.) and get hostname

    if (url.indexOf("//") > -1) {
        hostname = url.split('/')[2];
    }
    else {
        hostname = url.split('/')[0];
    }

    //find & remove port number
    hostname = hostname.split(':')[0];
    //find & remove "?"
    hostname = hostname.split('?')[0];

    return hostname;
}
function extractRootDomain(url) {
    var domain = extractHostname(url),
        splitArr = domain.split('.'),
        arrLen = splitArr.length;

    //extracting the root domain here
    //if there is a subdomain
    if (arrLen > 2) {
        domain = splitArr[arrLen - 2] + '.' + splitArr[arrLen - 1];
        //check to see if it's using a Country Code Top Level Domain (ccTLD) (i.e. ".me.uk")
        if (splitArr[arrLen - 2].length == 2 && splitArr[arrLen - 1].length == 2) {
            //this is using a ccTLD
            domain = splitArr[arrLen - 3] + '.' + domain;
        }
    }
    return domain;
}

async function getEmail(firstName, lastName, url, company) {
    console.log(firstName, lastName, url, company)
    const res = await axios.get('https://api.hunter.io/v2/email-finder', {
        params: {
            api_key: HUNTER_API_KEY,
            company,
            domain: extractRootDomain(url),
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`
        }
    });

    return {
        email: res.data.data.email,
        email_confidence_score: res.data.data.score
    };
}

async function getEmails(url, company) {
    const res = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: {
            api_key: HUNTER_API_KEY,
            company,
            domain: extractRootDomain(url),
            limit: 200,
            seniority: 'senior,executive'
        }
    });

    console.log(res.data)

    return _.reduce(res.data.data.emails, (res, email, i) => {
        return {
            ...res,
            [`email_${i}`]: email.value,
            [`email_confidence_${i}`]: email.confidence,
            [`email_first_name_${i}`]: email.first_name,
            [`email_last_name_${i}`]: email.last_name,
            [`email_pos_${i}`]: email.position,
            [`email_senority_${i}`]: email.senority,
            [`email_department_${i}`]: email.department,
        }
    }, {})
}

async function getDetailsInfo(detailsPage, browser, ref) {
    async function blackHole(cb) {
        try {
            return await cb();
        } catch(e) {
            return undefined;
        }
    }
    try {
        let title, address1, address2, city, state, zip, url, cats, reps = [], rep, emails = {}, email, email_confidence_score = 0;

        title = await blackHole(async () => await detailsPage.$eval('h1', element => element.textContent));
        address1 = await blackHole(async () => await detailsPage.$eval('.mn-address1', element => element.textContent));
        address2 = await blackHole(async () => await detailsPage.$eval('.mn-address2', element => element.textContent));
        city = await blackHole(async () => await detailsPage.$eval('.mn-cityspan', element => element.textContent));
        state = await blackHole(async () => await detailsPage.$eval('.mn-stspan', element => element.textContent));
        cats = await blackHole(async () => await detailsPage.$eval('.mn-member-cat-container', element => element.textContent));
        const phone1 = await blackHole(async () => await detailsPage.$eval('.mn-member-phone1', element => element.textContent));
        const memberGeneral = await detailsPage.$('#mn-member-general');
        try {
            const urlEl = await memberGeneral.$('#mn-memberinfo-block-website');
            const aEl = await urlEl.$('a');
            const href = await aEl.getProperty('href');
            url = await href.jsonValue();
        } catch(e) {

            try {
                const urlEl = await memberGeneral.$('.mn-member-url');
                const aEl = await urlEl.$('a');
                const href = await aEl.getProperty('href');
                url = await href.jsonValue();
            } catch(e) {
                url = '';
            }
        }

        // try {
        //     let repInfoEl = await detailsPage.$('#mn-tab-repinfo');
        //     await repInfoEl.click();
        //     let repInfoContent = await detailsPage.$('#repinfo');
        //     reps = await repInfoContent.$$eval('.mn-member-repname', (reps) => reps.map(rep => rep.textContent.trim()));
        //     rep = _.first(reps).trim().replaceAll('  ', ' ');
        //     const [
        //         fistName,
        //         lastName
        //     ] = rep.split(' ')
        //     let res = await getEmail(fistName, lastName, url, title)
        //     email = res.email;
        //     email_confidence_score = res.email_confidence_score;
        //     console.log(email, email_confidence_score)
        // } catch(e) {
        //
        // }

        try {
            emails = await getEmails(url, title);
            console.log(emails)
        } catch (e) {
            console.log(e.response.data)
        }

        await detailsPage.close();

        return {
            ref,
            Name: title,
            'Phone Number': phone1,
            'Street Address': `${address1}, ${address2 || ''}`,
            City: city,
            State: state,
            domain: url,
            category: _.trim(cats),
            //representative: rep,
            //email,
            //email_confidence_score,
            ...emails
        }
    } catch(e) {
        return {
            ref,
            Name: '',
            'Phone Number':'',
            'Street Address': '',
            City: '',
            State: '',
            domain: '',
            category: '',
            //representative: '',
        }
    }


}

async function getItemInfo(itemElement, browser, page) {

    const title = await itemElement.$('.mn-title');
    const link = await title.$('a');
    const href = await link.getProperty('href')
    const val = await href.jsonValue();

    const detailsPage = await browser.newPage();
    await detailsPage.goto(val);

    return getDetailsInfo(detailsPage, browser, val)

}

async function execute() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('https://www.seminolebusiness.org/list/search?gr=25&o=alpha&st=0');

    const oddItems = await page.$$('.mn-list-item-odd');
    const evenItems = await page.$$('.mn-list-item-even');

    const oddResults = await processArray(_.slice(oddItems, 201, 251), async (oddItem) => getItemInfo(oddItem, browser, page));
    const evenResults = await processArray(_.slice(evenItems, 201, 251), async (evenItem) => getItemInfo(evenItem, browser, page));

    const results = _.sortBy([...oddResults, ...evenResults], 'Name');

    const csvResults = parser.json2csv(results);

    output.write('./__results__.csv', csvResults);

    return browser.close();

}

execute()
