const cheerio = require('cheerio');

const request = require('request-promise');
module.exports = {

    getGold1: function (callback) {
        request('https://giavangvietnam.com/gia-vang-sjc/', (error, response, html) => {
            console.log(response.statusCode);
            let i = 0;
            let res = '';
            if (!error && response.statusCode == 200) {
                const $ = cheerio.load(html);
                $('tr').each((index, el) => {
                    i += 1;
                    if (i === 3) {
                        let s = ['', '', ''];

                        const job = $(el).find('.text-right').each(
                            (i, e) => {
                                // console.log($(e).text());
                                s[i] = $(e).text();
                            }
                        );

                        let ss = 'Giá vàng SJC 9999 ' + 'mua vào: ' + s[1] + 'VNĐ bán ra: ' + s[0] + 'VNĐ chênh lệch: ' + s[2] + " VNĐ.";
                        console.log(ss);
                        callback(ss);
                    };
                });
            }
            else {
                console.log(error);
            }
        });
    },

    getGold2: function (callback) {
        request('https://giavangvietnam.com/gia-vang-sjc/', (error, response, html) => {
            console.log(response.statusCode);
            let i = 0;
            let res = '';
            if (!error && response.statusCode == 200) {
                const $ = cheerio.load(html);
                $('tr').each((index, el) => {
                    i += 1;
                    if (i === 4) {
                        let s = ['', '', ''];

                        const job = $(el).find('.text-right').each(
                            (i, e) => {
                                // console.log($(e).text());
                                s[i] = $(e).text();
                            }
                        );

                        let ss = 'Giá vàng nhẫn 99.99 ' + 'mua vào: ' + s[1] + 'VNĐ bán ra: ' + s[0] + 'VNĐ chênh lệch: ' + s[2] + " VNĐ.";
                        console.log(ss);
                        callback(ss);
                    };
                });
            }
            else {
                console.log(error);
            }
        });
    },

    getTimeUpdate: function (callback) {

        request('https://giavangvietnam.com/gia-vang-sjc/', (error, response, html) => {
            console.log(response.statusCode);
            if (!error && response.statusCode == 200) {
                const $ = cheerio.load(html);

                $('.update-time').each((index, el) => {
                    let s = 'Câp nhật lúc: ' + $(el).text();
                    callback(s);
                });

            }
            else {
                console.log(error);
            }

        });
    }

}