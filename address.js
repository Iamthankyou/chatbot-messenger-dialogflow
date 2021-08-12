'use strict';
const request = require('request');
const config = require('./config');
const pg = require('pg');
pg.defaults.ssl = true;

module.exports = {

    // readAllColors: function(callback) {
    //     var pool = new pg.Pool(config.PG_CONFIG);
    //     pool.connect(function(err, client, done) {
    //         if (err) {
    //             return console.error('Error acquiring client', err.stack);
    //         }
    //         client
    //             .query(
    //                 'SELECT color FROM public.iphone_colors',
    //                 function(err, result) {
    //                     if (err) {
    //                         console.log(err);
    //                         callback([]);
    //                     } else {
    //                         let colors = [];
    //                         for (let i = 0; i < result.rows.length; i++) {
    //                             colors.push(result.rows[i]['color']);
    //                         }
    //                         callback(colors);
    //                     };
    //                 });
    //     });
    //     pool.end();
    // },


    readUserAddress: function(callback, userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                    'SELECT address FROM public."user" WHERE fb_id=$1',
                    [userId],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback('');
                        } else {
                            callback(result.rows[0]['address']);
                        };
                    });

        });
        pool.end();
    },

    updateUserAddress: function(address, userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            let sql = 'UPDATE public."user" SET address=$1 WHERE fb_id=$2';
            client.query(sql,
                [
                    address,
                    userId
                ]);

        });
        pool.end();
    }


}
