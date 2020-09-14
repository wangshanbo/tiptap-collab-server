import SocketIO from 'socket.io';
import Document from './document';

const app = require('express')();
const http = require('http').Server(app);

export default class CollabServer {
  constructor(options) {
    this.options = options || {};
    this.io = new SocketIO(http);
    this.documents = [];

    // this.onConnectingCallback = () => {};
    // this.onConnectedCallback = () => {};
    // this.onUpdatingCallback = () => {};
    // this.onUpdatedCallback = () => {};
  }

  serve() {
    http.listen(this.options.port || 6000);

    this.namespaces = this.io.of(this.options.namespaceFilter || /^\/[a-zA-Z0-9_/-]+$/);

    this.namespaces.on('connection', (socket) => {
      const namespace = socket.nsp;

      socket.on('join', async (room) => {
        console.log('server on join', room);

        // this.onConnectingCallback({ namespace, room });

        socket.join(room);

        const document = this.findOrCreateDocument(namespace, room);

        // Handle version mismatch:
        // we send all steps of this version back to the user
        document.onVersionMismatch(({ version, steps }) => {
          console.log('document onVersionMismatch');
          namespace.in(room).emit('update', {
            version,
            steps,
          });
        });

        // Handle new document version
        // send update to everyone (me and others)
        document.onNewVersion(({ version, steps }) => {
          console.log('document onNewVersion');
          namespace.in(room).emit('update', {
            version,
            steps,
          });
        });

        // Handle update
        socket.on('update', async (data) => {
          console.log('server on update', data);
          // this.onUpdatingCallback({ document, data });
          document.update(data);
          // this.onUpdatedCallback({ document, data });
        });

        // Handle update
        socket.on('updateSelection', async (data) => {
          console.log('server on updateSelection', data);
          if (document.updateSelection(data, socket.id)) {
            console.log('server emit getSelections', document.getSelections());
            socket.to(room).emit('getSelections', document.getSelections());
          }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
          console.log('server on disconnect');
          document.removeSelection(socket.id);
          console.log('server emit getSelections', document.getSelections());
          namespace.in(room).emit('getSelections', document.getSelections());
          if (namespace.adapter.rooms[room]) {
            namespace.in(room).emit('getCount', namespace.adapter.rooms[room].length);
          } else {
            // Nobody is connected to the document anymore so it is deleted
            // (data is kept in database)
            this.removeDocument(document);
          }
        });

        // send latest document
        console.log('server emit init');
        socket.emit('init', document.getDoc());

        // send selections
        console.log('server emit getSelections', document.getSelections());
        namespace.in(room).emit('getSelections', document.getSelections());

        // send client count
        console.log('server emit getCount', namespace.adapter.rooms[room].length);
        namespace.in(room).emit('getCount', namespace.adapter.rooms[room].length);

        // console.log('server on connected', namespace.adapter.rooms);
        // this.onConnectedCallback({ document });
      });
    });

    return this;
  }

  findOrCreateDocument(namespace, room) {
    let document = this.findDocument(namespace, room);
    console.log('document found', document);
    if (!document) {
      document = new Document(namespace.name, room, this.options.maxStoredSteps);
      this.documents.push(document);
    }

    return document;
  }

  findDocument(namespace, room) {
    return this.documents.find((document) => document.id === `${namespace.name}/${room}`);
  }

  removeDocument(document) {
    // console.log('removing document', this.documents.map((doc) => doc.id), document.id);
    this.documents = this.documents.filter((doc) => doc.id !== document.id);
    // console.log('removed document', this.documents.map((doc) => doc.id));
  }

  close() {
    this.io.close();
  }

  // Hooks
  // onConnecting(callback) {
  //   this.onConnectingCallback = callback;
  //   return this;
  // }

  // onConnected(callback) {
  //   this.onConnectedCallback = callback;
  //   return this;
  // }

  // onUpdating(callback) {
  //   this.onUpdatingCallback = callback;
  //   return this;
  // }

  // onUpdated(callback) {
  //   this.onUpdatedCallback = callback;
  //   return this;
  // }
}
