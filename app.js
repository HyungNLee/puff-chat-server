var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var admin = require('firebase-admin');

var serviceAccount = require('./credentials/puff-chat-firebase-adminsdk-ge9t2-f4e4ed0e2e.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://puff-chat.firebaseio.com"
});

// As an admin, the app has access to read and write all data, regardless of Security Rules
var db = admin.database();

// ref.once("value", function(snapshot) {
//   console.log(snapshot.val());
// });


app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });

  //get message id
  let getMsgIndexPromise = function(index) {
    return new Promise((resolve, reject) => {
      let msgId = 0;
      db.ref(`chats/chatroom-${index}/msg-index`).on("value", snapshot => {
        msgId = snapshot.val();
      });
      db.ref(`chats/chatroom-${index}`).on("value", function(snapshot) {
        if (snapshot.val() !== null)
          resolve(msgId);
        else 
          reject(new Error("Failed to get message index."));
      });   
    });    
  };

  let previousMessagesPromise = function(index) {
    return new Promise((resolve, reject) => {
      let messages = {};
      db.ref(`messages/chatroom-${index}`).orderByChild("timestamp").on("child_added", function(snapshot) {
        messages[snapshot.key] = snapshot.val();
      });
      db.ref(`chats/chatroom-${index}`).on("value", function(snapshot) {
        if (snapshot.val() !== null)
          resolve(messages);
        else 
          reject(new Error("Failed to get previous messages."));
      });
    });
  }

  socket.on('previousMessages', function(index) {
    previousMessagesPromise(index).then(messages => {
      io.emit('previousMessages', messages);
    });
  });

  socket.on('message', function(msg){
    console.log(msg);
    getMsgIndexPromise(msg.chatroomIndex).then(function(msgId) {
      db.ref(`members/chatroom-${msg.chatroomIndex}/${msg.username}`).on("value", function(snapshot) {
        //if user exists in this chat room,
        if (snapshot.val() !== null && snapshot.val() === true) {
          console.log(snapshot.val());
        }
        //if user does not exist in this chat rooom or does not exist in the database,
        else {
          db.ref(`members/chatroom-${msg.chatroomIndex}`).child(msg.username).set(true);
        }
      }, function (errorObject) {
         console.log("The read failed: " + errorObject.code);
      });
  
      let currentTime = Date.now();
      db.ref(`messages/chatroom-${msg.chatroomIndex}`).child(`message-${msgId}`).set({
        "msg": msg.msg,
        "timestamp": currentTime,
        "username": msg.username,
      });
  
      //increase message index
      db.ref(`chats/chatroom-${msg.chatroomIndex}/msg-index`).set(++msgId);
      io.emit('message', { username: msg.username, msg: msg.msg, timestamp: currentTime, chatroomIndex: msg.chatroomIndex } );
    });
  });
});

http.listen(8988, function(){
  console.log('listening on *:8988');
});

