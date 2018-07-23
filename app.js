'use strict'
const
  debug = require('debug')('app:index'),
  webhookDebug = require('debug')('app:webhook');
const request = require('request');
var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var app = express();
const PQueue = require('p-queue');
const mongoOxfam = require("./routes/mongoose");
const dataJSON = require('./public/quiz.json');
const chatJSON = require('./public/chat.json');

//dom(app); 
// :: Dependencies in the personal code

app.use(logger('dev', 'tiny'));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

async function handleMessageQuiz(psid, quick_reply){

  let user = await mongoOxfam.findOne({ "PSID": psid});
  let response;
  if (!user)
    user = await createUser(psid);
   
  if (quick_reply) {
    user = await saveResult(user, quick_reply.payload);
  }
  
  const anwsered_count = user.answered.count;
  if ( anwsered_count == dataJSON.length ) {
    const profil = getProfil(user);
    return response = { 
      "text": "Congrats ! Ton profil benevole est :  "+ chatJSON.profils[profil].text
    }
  }
  else if (anwsered_count < 0 || anwsered_count > dataJSON.length) {
    user.answered.count = 0;
    await user.save();
    //res.status(400).send({ message: "error of database, please retry " });
  }
  
  const content = dataJSON[anwsered_count];
  response = createQuickReplies(content);
  
  return response;
 // res.status(200).send({ content: content, profil: profil, response : response });
}

async function createUser(psid) {
  console.log("create new user with the psid : " + psid);
  let user = new mongoOxfam();
  user.PSID = psid;

  return await user.save();
}

 async function incrementCount(user) {
   user.answered.count++;
   return await user.save();
 }

async function saveResult(user, payload) {
  const arrayName = payload.split("-");
  user = await mongoOxfam.findByIdAndUpdate(user._id, { $push: { "result": arrayName }});
  return await incrementCount(user);
}

function getProfil(user) {
  const array = user.result;
  if (array.length == 0)
    return null;
  var modeMap = {};
  var maxEl = array[0], maxCount = 1;
  for (var i = 0; i < array.length; i++) {
    var el = array[i];
    if (modeMap[el] == null)
      modeMap[el] = 1;
    else
      modeMap[el]++;
    if (modeMap[el] > maxCount) {
      maxEl = el;
      maxCount = modeMap[el];
    }
  }
  return maxEl;
}
// app.get('/', (req, res) => {

// 	console.log('prout');
// 	res.sendStatus(200, {message : " evrything is oké" });
// 	});

app.post('/webhook', (req, res) => {

  
  
  let body = req.body;
console.log("hook webhook");
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      webhookDebug(webhook_event);

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      webhookDebug('Sender PSID: ' + sender_psid);

      
        let test = {};
  test = {
  "recipient":{
    "id":sender_psid
  },
  "sender_action":"typing_off"
}
      
  return callSendAPIDirect(sender_psid, test);
      
      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        
        //if (webhook_event.message.quick_reply) {
          handleMessageQuiz(sender_psid, webhook_event.message.quick_reply).then( result =>   callSendAPI(sender_psid, result));
          
         // handlePostback(sender_psid, webhook_event.message.quick_reply);
      //  } else
        //  handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.get('/webhook', (req, res) => {
  console.log('fucker');
  let VERIFY_TOKEN = process.env.PAGE_ACCESS_TOKEN;

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      webhookDebug('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(404);
    }
  }
});

function createQuickReplies(question) {

  let quick_replies = [];
  let response = {};
  let attachment = {};
  
  question.answers.forEach(answer => {
    let reply = {};
    reply.content_type = "text";
    reply.title = answer.text;
    reply.payload = answer.payload;

    quick_replies.push(reply);
  });
  attachment.type =  "image";
  attachment.payload = {
    "url" : question.question,
    "is_reusable" : false
  };
  
  response.attachment = attachment;
  response.quick_replies = quick_replies;

  return response;
}

// Handles messages events
// function handleMessage(sender_psid, received_message) {
//   let response;
//   var responses = [];
//   // Checks if the message contains text
//   if (received_message.text) {

//     response = {
//       "quick_replies": [
//         {
//           "content_type": "text",
//           "title": '1. 📢',
//           "payload": "CLE-ALI",
//         },
//         {
//           "content_type": "text",
//           "title": "2. 🔢",
//           "payload": "GIU",
//         },
//         {
//           "content_type": "text",
//           "title": "3. 📱",
//           "payload": "BEN",
//         },
//         {
//           "content_type": "text",
//           "title": "4. 🏝️",
//           "payload": "BIL-LIS-PHI",
//         }
//       ],
//       "attachment": {
//         "type": "image",
//         "payload": {
//           "url": "https://s3.eu-central-1.amazonaws.com/admented/test/question-template-texts-smileys.png",
//           "is_reusable": true
//         }
//       }
//     }


//   }
  /*let response;

  // Check if the message contains text
  if (received_message.text) {    

    // Create the payload for a basic text message
    response = {
      "text": `You sent the message: "${received_message.text}". Now send me an image!`
    }
  }*/

//   // Sends the response message
//   callSendAPI(sender_psid, response);
// }

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  let response;

  // Get the payload for the postback
  let payload = received_postback.payload;
  
  
  if ( payload == "start_quiz" ) {
    response = { "text": chatJSON.letsgo };
    
  }
  // Set the response based on the postback payload

  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
}

function parsePayload(payload) {
  return payload.split('-');
}

function callSendAPIDirect( sender_psid, response ) {

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": response
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
      console.dir(response);
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

function callSendAPI(sender_psdi, response) {

  let request_body = {
    "recipient": {
      "id": sender_psdi
    },
    "messaging_type": "response",
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
      console.dir(response);
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}
// Sends response messages via the Send API
async function callSendAPIasync(sender_psid, responses) {

  var promiseTasks = [];
  responses.forEach((response) =>
    promiseTasks.push(promiseCallSendApi(sender_psid, response))
  );


  const queue = new PQueue({ concurrency: 1 });
  return new Promise((resolve, reject) => {
    queue.addAll(promiseTasks).then(() => { console.log("end resolve change postition"); resolve(); }).catch(err => reject);
  });

}

function promiseCallSendApi(sender_psid, response) {
  return new Promise((resolve, reject) => {
    let request_body = {
      "recipient": {
        "id": sender_psid
      },
      "message": response
    }

    // Send the HTTP request to the Messenger Platform
    request({
      "uri": "https://graph.facebook.com/v2.6/me/messages",
      "qs": { "access_token": process.env.PAGE_ACCESS_TOKEN },
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        resolve(response);
        console.log('message sent!')
        console.dir(response);
      } else {
        console.error("Unable to send message:" + err);
        reject(err);
      }
    });
  });
}

app.listen(process.env.PORT || 1337, () => debug('listen to ' + process.env.PORT));

