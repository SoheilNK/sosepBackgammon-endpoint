import { w3cwebsocket as W3CWebSocket, IMessageEvent } from "websocket";
import * as interfaces from "../interfaces";
// import { onlineGames } from "./controllers/GameController";
const games = require("./controllers/GameController");
const onlineGames = games.onlineGames;
export const clients = new Map<string, W3CWebSocket>();

const getUniqueID = () => {
  var s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return s4() + s4() + "-" + s4();
};

export const createWebSocketServer = (port: number) => {
  const webSocketServer = require("websocket").server;
  const http = require("http");

  const server = http.createServer();
  server.listen(port);
  console.log(`webSocketServer listening on port ${port}`);

  const wsServer = new webSocketServer({
    httpServer: server,
  });

  wsServer.on("request", (request) => {
    let userID: string;
    const { origin } = request;
    console.log(` Received a new connection from origin ${origin}.`);

    const connection = request.accept(null, request.origin);

    if (request.key && clients.has(request.key)) {
      userID = request.key;
      console.log(`User ${userID} reconnected.`);
    } else {
      userID = getUniqueID();
      clients.set(userID, connection);
      console.log(`New user ${userID} connected.`);
      //send back userID to the client
      connection.sendUTF(JSON.stringify({ type: "userID", data: userID }));
      //update onlinemages
    }

    console.log(
      "WebSocket-connected for user id: " +
        userID +
        " in " +
        Array.from(clients.keys())
    );
    let onlineUser: interfaces.OnlineUser = {
      userId: userID,
      userName: "",
      status: "Online",
    };

    connection.on("message", function (message: IMessageEvent) {
      if (message.type === "utf8") {
        try {
          console.log("Received Message: ", message.utf8Data);
          let data = JSON.parse(message.utf8Data);
          let msgFor = data.msgFor;
          //get the opponent's id from the onlineGames array
          let thisGame = onlineGames.find(
            (game: any) => game.matchId === data.matchId
          );
          console.log(`thisGame: ${JSON.stringify(thisGame)}`);
          let opponentId =
            msgFor === "host" ? thisGame.hostId : thisGame.guestId;
        } catch (error) {
          console.log(error);
        }

        //send the message to the opponent
        const client = clients.get(opponentId);
        if (client) {
          client.sendUTF(message.utf8Data);
          console.log(`Sent Message to ${opponentId}`);
        }
        // //send the message to the sender
        // connection.sendUTF(message.utf8Data);
        // console.log(`Sent Message to ${userID}`);

        // //send the message to all other users
        // clients.forEach((otherConnection, key) => {
        //     if (key !== userID) {
        //         otherConnection.sendUTF(message.utf8Data);
        //         console.log(`Sent Message to ${key}`);
        //     }
        // });
      }
    });

    connection.on("close", () => {
      clients.delete(userID);
      console.log(`User ${userID} disconnected.`);
    });
  });
  const sendMessage = (clientId: string, message: string) => {
    const client = clients.get(clientId);
    if (client) {
      client.sendUTF(message);
    }
  };

  return wsServer;
};