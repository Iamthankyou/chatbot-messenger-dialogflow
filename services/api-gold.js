const cheerio = require('cheerio');

const request = require('request-promise');
module.exports = {

    getGold: function (callback) {
        request('https://giavangvietnam.com/gia-vang-sjc/', (error, response, html) => {
            console.log(response.statusCode);
            let i = 0;
            if (!error && response.statusCode == 200) {
                const $ = cheerio.load(html);
                $('tr').each((index, el) => {
                    i += 1;
                    if (i === 6) {
                        let s = ['', '', ''];

                        const job = $(el).find('.text-right').each(
                            (i, e) => {
                                // console.log($(e).text());
                                s[i] = $(e).text();
                            }
                        );

                        let ss = 'Giá vàng hiện tại ' + 'mua vào: ' + s[1] + 'VNĐ bán ra: ' + s[0] + 'VNĐ chênh lệch: ' + s[2] + " VNĐ";
                        console.log(ss);
                        callback(ss);
                    };
                });
            }
            else {
                console.log(error);
            }
        });
    }


}