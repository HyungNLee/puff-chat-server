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

  let getChatroomsListPromise = new Promise((resolve, reject) => {
    let list = [];
    let returnedObject = {};
    db.ref(`chats`).on("value", snapshot => {
      returnedObject = snapshot.val();
      if (returnedObject !== null) {
        Object.keys(returnedObject).forEach(key => {
          list.push({ title: returnedObject[key].title, id: key });
        });
        resolve(list);
      }
      else {
        reject(new Error("Failed to get chatrooms list."));
      }
    });

  });

  //get message id
  let getMsgIndexPromise = function(index) {
    return new Promise((resolve, reject) => {
      let msgId = 0;
      db.ref(`chats/${index}/msg-index`).on("value", snapshot => {
        msgId = snapshot.val();
      });
      db.ref(`chats/${index}`).on("value", function(snapshot) {
        if (snapshot.val() !== null)
          resolve(msgId);
        else 
          reject(new Error("Failed to get message index."));
      });   
    });    
  };

  let previousMessagesPromise = function(index) {
    return new Promise((resolve, reject) => {
      db.ref(`chats/${index}`).on("value", function(snapshot) {
        if (snapshot.val() !== null) {
          let messages = {};
          db.ref(`messages/${index}`).orderByChild("timestamp").on("child_added", function(snapshot) {
            messages[snapshot.key] = snapshot.val();
          });
          resolve(messages);
        }
        else 
          reject(new Error("Failed to get previous messages."));
      });
    });
  }

  socket.on('chatroomsList', function(msg) {
    getChatroomsListPromise.then(function(list) {
      io.emit('chatroomsList', list);
    });
  });

  socket.on('previousMessages', function(index) {
    previousMessagesPromise(index).then(messages => {
      io.emit('previousMessages', messages);
    });
  });

  socket.on('message', function(msg){
    console.log(msg);
    getMsgIndexPromise(msg.selectedChatroom).then(function(msgId) {
      db.ref(`members/${msg.selectedChatroom}/${msg.username}`).on("value", function(snapshot) {
        //if user exists in this chat room,
        if (snapshot.val() !== null && snapshot.val() === true) {
          console.log(snapshot.val());
        }
        //if user does not exist in this chat rooom or does not exist in the database,
        else {
          db.ref(`members/${msg.selectedChatroom}`).child(msg.userUID).set(msg.username);
        }
      }, function (errorObject) {
         console.log("The read failed: " + errorObject.code);
      });
  
      let currentTime = Date.now();
      db.ref(`messages/${msg.selectedChatroom}`).child(`message-${msgId}`).set({
        "msg": msg.msg,
        "timestamp": currentTime,
        "username": msg.username,
      });
  
      //increase message index
      db.ref(`chats/${msg.selectedChatroom}/msg-index`).set(++msgId);
      io.emit('message', { username: msg.username, msg: msg.msg, timestamp: currentTime, selectedChatroom: msg.selectedChatroom } );
    });
  });

  socket.on('updateUsername', function(msg) {
    db.ref(`members`).once("value").then(snapshot => {
      Object.keys(snapshot.val()).forEach(chatroom => {
        db.ref(`members/${chatroom}/${msg.userUID}`).set(msg.newUsername);
      });
    });
    db.ref(`messages`).once("value").then(snapshot => {
      Object.keys(snapshot.val()).forEach(chatroom => {
        db.ref(`messages/${chatroom}`).orderByChild("uid").equalTo(`${msg.userUID}`).on("value", snapshot => {
          if (snapshot.val() !== null && snapshot.val() !== undefined) {
            Object.keys(snapshot.val()).forEach(message => {
              console.log(chatroom);
              console.log(message);
              db.ref(`messages/${chatroom}/${message}/username`).set(msg.newUsername);
            });
          }
        });
      });
    });
  });

  // socket.on('logout', function(msg) {
  //   db.ref(`members/${msg.selectedChatroom}`).child(msg.checkoutUsername).remove();
  // });

  socket.on('checkin', function(msg) {
    db.ref(`members/${msg.selectedChatroom}/${msg.checkinUID}`).once("value").then(snapshot => {
      if (snapshot.exists() === false) {
        db.ref(`members/${msg.selectedChatroom}/${msg.checkinUID}`).set(msg.checkinUsername);
      }
    });
  });
});

http.listen(8988, function(){
  console.log('listening on *:8988');
});

