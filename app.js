'use strict';

const dialogflow = require('dialogflow');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
const pg = require('pg');
pg.defaults.ssl = true;

const broadcast = require('./routes/broadcast');
// const userService = require('./user');
const userService = require('./services/user-service');
const address = require('./address');

const weatherService = require('./services/weather-service');
// const jobApplicationService = require('./services/job-application-service');
let dialogflowService = require('./services/dialogflow-service');
const fbService = require('./services/fb-service');

const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const session = require('express-session');

// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
    throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
    throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
    throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
    throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
    throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
    throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
    throw new Error('missing SERVER_URL');
}
if (!config.WEATHER_API_KEY) { //weather api key
    throw new Error('missing WEATHER_API_KEY');
}
if (!config.PG_CONFIG) { //pg config
    throw new Error('missing PG_CONFIG');
}
if (!config.FB_APP_ID) { //app id
    throw new Error('missing FB_APP_ID');
}


app.set('port', (process.env.PORT || 5000))

//verify request came from facebook
app.use(bodyParser.json({
    verify: fbService.verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));

// Process application/json
app.use(bodyParser.json());

app.use(session(
    {
        secret: 'keyboard cat',
        resave: true,
        saveUninitilized: true
    }
));

app.set("view engine","ejs")


app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(profile, cb) {
    cb(null, profile);
});

passport.deserializeUser(function(profile, cb) {
    cb(null, profile);
});

passport.use(new FacebookStrategy({
        clientID: config.FB_APP_ID,
        clientSecret: config.FB_APP_SECRET,
        callbackURL: config.SERVER_URL + "auth/facebook/callback"
    },
    function(accessToken, refreshToken, profile, cb) {
        process.nextTick(function() {
            return cb(null, profile);
        });
    }
));

app.get('/auth/facebook', passport.authenticate('facebook',{scope:'public_profile'}));


app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { successRedirect : '/broadcast/broadcast', failureRedirect: '/broadcast' }));

app.set('view engine', 'ejs');


const credentials = {
    client_email: config.GOOGLE_CLIENT_EMAIL,
    private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient(
    {
        projectId: config.GOOGLE_PROJECT_ID,
        credentials
    }
);


const sessionIds = new Map();
const usersMap = new Map();

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

app.use('/broadcast', broadcast);

// for Facebook verification
app.get('/webhook/', function (req, res) {
    console.log("request");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function (req, res) {
    var data = req.body;
    console.log(JSON.stringify(data));



    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.optin) {
                    fbService.receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    fbService.receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    fbService.receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    fbService.receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});

function setSessionAndUser(senderID) {
    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }

    if (!usersMap.has(senderID)) {
        userService.addUser(function (user) {
            usersMap.set(senderID, user);
        }, senderID);
    }
}

function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    setSessionAndUser(senderID);
    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        fbService.handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }


    if (messageText) {
        //send message to api.ai
        dialogflowService.sendTextQueryToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, messageText);
    } else if (messageAttachments) {
        fbService.handleMessageAttachments(messageAttachments, senderID);
    }
}

function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s", messageId, quickReplyPayload);
    //send payload to api.ai
    switch (quickReplyPayload) {
        //send payload to api.ai	        
        case 'NEWS_PER_WEEK':
            dialogflowService.sendTextQueryToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, quickReplyPayload); userService.newsletterSettings(function (updated) {
                if (updated) {
                    fbService.sendTextMessage(senderID, "Đã đăng ký hàng tuần rồi nha<3 !" +
                        "Nếu muốn, bạn có thể nhắn hủy đăng ký bất cứ lúc nào'");
                } else {
                    fbService.sendTextMessage(senderID, "Đăng ký không khả dụng ngay bây giờ." +
                        "Vui lòng thử lại sau!");
                }
            }, 1, senderID);
            break;
        case 'NEWS_PER_DAY':
            userService.newsletterSettings(function (updated) {
                if (updated) {
                    fbService.sendTextMessage(senderID, "Đã đăng ký hàng ngày rồi nha <3!" +
                        "Nếu muốn, bạn có thể nhắn hủy đăng ký bất cứ lúc nào'");
                } else {
                    fbService.sendTextMessage(senderID, "Đăng ký không khả dụng bây giờ." +
                        "Vui lòng thử lại sau!");
                }
            }, 2, senderID);
            break;
        default:
            dialogflowService.sendTextQueryToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, quickReplyPayload);
            break;
    }
}

function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
    switch (action) {
        case "faq-delivery":
            fbService.handleMessages(messages, sender);

            fbService.sendTypingOn(sender);

            //ask what user wants to do next
            setTimeout(function () {
                let buttons = [
                    {
                        type: "web_url",
                        url: "https://i.ghtk.vn/",
                        title: "Theo dõi quá trình giao hàng"
                    },
                    {
                        type: "phone_number",
                        title: "Gọi cho shop",
                        payload: "+84392301017",
                    },
                    {
                        type: "postback",
                        title: "Tiếp tục nhắn tin",
                        payload: "CHAT"
                    }
                ];

                fbService.sendButtonMessage(sender, "Bạn muốn làm điều gì tiếp theo ?", buttons);
            }, 3000)

            break;

        case "buy_product.buy_product-custom":
            address.readUserAddress(function (addr) {
                let reply;
                if (!fbService.isDefined(addr) || addr === '' || addr === 'null' || addr.length < 2) {
                    reply = 'Hệ thống báo đây là lần đầu bạn mua hàng trên shop ?';
                    // console.log('This is sender: ' + sender);
                    // setSessionAndUser(sender);

                    // dialogflowService.sendEventToDialogFlow(sessionIds, handleDialogFlowResponse, sender, 'NO_ADDRESS');            
                } else {
                    reply = `Nhắn "có" nếu bạn cần giao đến địa chỉ mới, "không" nếu dùng địa chỉ cũ này: ${addr}?`;
                }

                fbService.sendTextMessage(sender, reply);

            }, sender
            )
            break;

        case "applyed_product":
            let filteredContexts = contexts.filter(function (el) {
                return el.name.includes('buy-product-show') ||
                    el.name.includes('buy_product_apply_dialog_context')
            });
            if (filteredContexts.length > 0 && contexts[0].parameters) {
                let phone_number = (fbService.isDefined(contexts[0].parameters.fields['phone'])
                    && contexts[0].parameters.fields['phone'] != '') ? contexts[0].parameters.fields['phone'].stringValue : '';
                let user_name = (fbService.isDefined(contexts[0].parameters.fields['name'])
                    && contexts[0].parameters.fields['name'] != '') ? contexts[0].parameters.fields['name'].stringValue : '';
                let addr = (fbService.isDefined(contexts[0].parameters.fields['address'])
                    && contexts[0].parameters.fields['address'] != '') ? contexts[0].parameters.fields['address'].stringValue : '';
                let bill = (fbService.isDefined(contexts[0].parameters.fields['bill'])
                    && contexts[0].parameters.fields['bill'] != '') ? contexts[0].parameters.fields['bill'].stringValue : '';

                if (phone_number != '' && user_name != '' && addr != '' && bill == '') {
                    let replies = [
                        {
                            "content_type": "text",
                            "title": "COD",
                            "payload": "COD"
                        },
                        {
                            "content_type": "text",
                            "title": "Ví điện tử",
                            "payload": "Vi dien tu"
                        }
                    ];
                    fbService.sendQuickReply(sender, messages[0].text.text[0], replies);


                } else if (phone_number != '' && user_name != '' && addr != '' && bill != '') {
                    let emailContent = 'Fullname: ' + user_name + ' address: ' + addr +
                        '.<br> Phone number: ' + phone_number + '.<br> Bill: ' + bill + '.';
                    // sendEmail('New job application', emailContent);
                    address.updateUserAddress(emailContent, sender);

                    console.log(emailContent);

                    fbService.handleMessages(messages, sender);
                } else {
                    fbService.handleMessages(messages, sender);
                }
            }
            break;

        case "get-current-weather":
            if (parameters.fields.hasOwnProperty('city-name') && fbService.isDefined(parameters.fields['city-name'].stringValue != '') && parameters.fields['city-name'].stringValue != '') {
                weatherService(function (weatherResponse) {
                    if (!weatherResponse) {
                        fbService.sendTextMessage(sender,
                            `Không tìm thấy thành phố ${parameters.fields['city-name'].stringValue}`);
                    } else {
                        let reply = `${messages[0].text.text} ${weatherResponse}`;
                        console.log('??' + parameters.fields['city-name'].stringValue);
                        fbService.sendTextMessage(sender, reply);
                    }
                }, parameters.fields['city-name'].stringValue);
            } else {
                fbService.handleMessages(messages, sender);
                // fbService.sendTextMessage(sender, 'Thời tiết không khả dụng');
            }

            break;
        case 'subcribers':
            sendFunNewsSubscribe(sender);
            break;
        case "unsubscribe":
            userService.newsletterSettings(function(updated) {
                if (updated) {
                    fbService.sendTextMessage(sender, "Đã hủy đăng ký theo dõi shop, xin lỗi đã làm phiền, nhưng chúng tôi luôn luôn chờ bạn trở lại!");
                } else {
                    fbService.sendTextMessage(sender, "Không khả dụng, xin lỗi vì sự bất tiện này." +
                        "Vui lòng thử lại sau!");
                }
            }, 0, sender);
        break;
        default:
            //unhandled action, just send back the text
            fbService.handleMessages(messages, sender);

    }
}


function sendFunNewsSubscribe(userId) {
    let responceText = "Cảm ơn bạn đã đăng ký ủng hộ shop." +
        "Shop sẽ gửi tin tức về sản phẩm cho bạn thường xuyên, bạn muốn nhận tin tức hằng ngày hay theo tuần?";

    let replies = [
        {
            "content_type": "text",
            "title": "Hàng tuần",
            "payload": "NEWS_PER_WEEK"
        },
        {
            "content_type": "text",
            "title": "Hàng ngày",
            "payload": "NEWS_PER_DAY"
        }
    ];

    fbService.sendQuickReply(userId, responceText, replies);
}

function handleDialogFlowResponse(sender, response) {
    let responseText = response.fulfillmentMessages.fulfillmentText;

    let messages = response.fulfillmentMessages;
    let action = response.action;
    let contexts = response.outputContexts;
    let parameters = response.parameters;

    fbService.sendTypingOff(sender);

    if (fbService.isDefined(action)) {
        handleDialogFlowAction(sender, action, messages, contexts, parameters);
    } else if (fbService.isDefined(messages)) {
        fbService.handleMessages(messages, sender);
    } else if (responseText == '' && !fbService.isDefined(action)) {
        //dialogflow could not evaluate input.
        fbService.sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
    } else if (fbService.isDefined(responseText)) {
        fbService.sendTextMessage(sender, responseText);
    }
}



async function resolveAfterXSeconds(x) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(x);
        }, x * 1000);
    });
}


async function greetUserText(userId) {
    let user = usersMap.get(userId);
    if (!user) {
        await resolveAfterXSeconds(2);
        user = usersMap.get(userId);
    }
    if (user) {
        fbService.sendTextMessage(userId, "Chào " + user.first_name + '! ' +
            'Shop có thể tư vấn cho bạn điều gì nào ? ');
    } else {
        fbService.sendTextMessage(userId, 'Chào bạn! ' +
            '');
    }
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    setSessionAndUser(senderID);

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    switch (payload) {
        case 'CHAT':
            //user wants to chat
            fbService.sendTextMessage(senderID, "Bạn muốn shop tư vấn về điều gì?");
            break;
        case 'GET_STARTED':
            greetUserText(senderID);
            break;
        case 'BUY_PRODUCT':
            dialogflowService.sendEventToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, 'BUY_PRODUCT');
            break;
        case 'TRACKING_PRODUCT':
            dialogflowService.sendEventToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, 'TRACKING_PRODUCT');
            break;
        default:
            //unindentified payload
            fbService.sendTextMessage(senderID, "Tôi không hiểu lời bạn nói lắm, bạn có thể nói lại được không?");
            break;

    }

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

}




// Spin up the server
app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})
