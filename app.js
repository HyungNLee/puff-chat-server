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

  let selectedChat = 0;

  socket.on('selectChatroom', index => {
    selectedChat = index;
  });

  //get message id
  let index = 0;
  db.ref(`chats/chatroom-${selectedChat}/msg-index`).on("value", function(snapshot) {
    index = snapshot.val();
  });

  let messages = {};
  db.ref(`messages/chatroom-${selectedChat}`).orderByChild("timestamp").on("child_added", function(snapshot) {
    messages[snapshot.key] = snapshot.val();
  });

  socket.on('previousMessages', function(msg) {
    io.emit('previousMessages', messages);
  });

  socket.on('message', function(msg){
    console.log(msg);
    db.ref(`members/chatroom-${selectedChat}/${msg.username}`).on("value", function(snapshot) {
      //if user exists in this chat room,
      if (snapshot.val() !== null && snapshot.val() === true) {
        console.log(snapshot.val());
      }
      //if user does not exist in this chat rooom or does not exist in the database,
      else {
        db.ref(`members/chatroom-${selectedChat}`).child(msg.username).set(true);
      }
    }, function (errorObject) {
       console.log("The read failed: " + errorObject.code);
    });

    let messageId = "message-"+index;
    let currentTime = Date.now();
    db.ref(`messages/chatroom-${selectedChat}`).child(messageId).set({
      "msg": msg.msg,
      "timestamp": currentTime,
      "username": msg.username,
    });

    //increase message index
    db.ref(`chats/chatroom-${selectedChat}/msg-index`).set(++index);
    io.emit('message', { username: msg.username, msg: msg.msg, timestamp: currentTime } );
  });
});

http.listen(8988, function(){
  console.log('listening on *:8988');
});

