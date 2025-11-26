/**
 * sendMessage.js
 * Requires mastodon
 * Copyright 2018 Valerio Vaccaro - www.valeriovaccaro.it
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
  var Masto = require('mastodon')
  const fs = require('fs');
  const {Duplex} = require('stream')

  // Helper function to create a file stream from image data
  function createFileStream(imageData) {
    if (typeof imageData === 'string') {
      return fs.createReadStream(imageData);
    } else if (typeof imageData === 'object' && Buffer.isBuffer(imageData)) {
      const stream = new Duplex();
      stream.path = '/tmp/image';
      stream.push(imageData);
      stream.push(null);
      return stream;
    }
    return null;
  }

  // Helper function to upload a single image
  function uploadImage(M, imageData, description) {
    const file = createFileStream(imageData);
    if (!file) {
      return Promise.reject(new Error('Invalid image data'));
    }
    const body = { file };
    if (description) {
      body.description = description;
    }
    return M.post('media', body).then(resp => resp.data.id);
  }

  function sendMessage(n) {
    RED.nodes.createNode(this, n);

    var msg = {};
    var access_token;
    var visibility;
    var timeout_ms;
    var api_url;
    var node = this;

    // Get varables from the node
    this.access_token = n.access_token;
    this.visibility = n.visibility;
    this.timeout_ms = n.timeout_ms;
    this.api_url = n.api_url;

    // Status icon
    this.status({
      fill: "grey",
      shape: "dot",
      text: "Waiting"
    });

    this.on("input", function(msg) {
      var M = new Masto({
        access_token: this.access_token,
        timeout_ms: this.timeout_ms, // optional HTTP request timeout to apply to all requests.
        api_url: this.api_url, // optional, defaults to https://mastodon.social/api/v1/
      });
      if (msg.payload.hasOwnProperty('image')) {
        // Check if image is an array
        if (Array.isArray(msg.payload.image)) {
          // Handle array of images
          const uploadPromises = msg.payload.image.map(item => {
            // Each item should be { image: buffer/filename, description: string }
            if (typeof item === 'object' && item.image) {
              return uploadImage(M, item.image, item.description);
            } else {
              // Fallback for simple array of buffers/filenames
              return uploadImage(M, item, null);
            }
          });

          Promise.all(uploadPromises).then(media_ids => {
            const body = {
              status: msg.payload.text,
              visibility: msg.payload.visibility || this.visibility,
              media_ids: media_ids
            };
            if (msg.payload.contentWarning) {
              body.spoiler_text = msg.payload.contentWarning;
            }
            if (msg.payload.sensitive) {
              body.sensitive = true;
            }
            return M.post('statuses', body);
          }).then(() => {
            this.status({
              fill: "green",
              shape: "dot",
              text: "sent: " + msg.payload.text
            });
          }).catch(err => {
            this.status({
              fill: "red",
              shape: "dot",
              text: "Error: " + err.message
            });
          });
        } else {
          // Handle single image (existing behavior)
          var id;
          var file = createFileStream(msg.payload.image);
          const body = {
            file
          }
          if (msg.payload.description) {
            body.description = msg.payload.description
          }
          M.post('media', body).then(resp => {
            id = resp.data.id;
            const body = {
              status: msg.payload.text,
              visibility: msg.payload.visibility || this.visibility,
              media_ids: [id]
            }
            if (msg.payload.contentWarning) {
              body.spoiler_text = msg.payload.contentWarning
            }
            if (msg.payload.sensitive) {
              body.sensitive = true
            }
            return M.post('statuses', body);
          }).then(() => {
            this.status({
              fill: "green",
              shape: "dot",
              text: "sent: " + msg.payload.text
            });
          }).catch(err => {
            this.status({
              fill: "red",
              shape: "dot",
              text: "Error: " + err.message
            });
          });
        }
      } else {
        const body = {
          status: msg.payload.text,
          visibility: msg.payload.visibility || this.visibility
        }
        if (msg.payload.contentWarning) {
          body.spoiler_text = msg.payload.contentWarning
        }
        if (msg.payload.sensitive) {
          body.sensitive = true
        }
        M.post('statuses', body);
        this.status({
          fill: "green",
          shape: "dot",
          text: "sent: " + msg.payload.text
        });
      }
    });

    this.on("close", function() {
      try {
        this.status({
          fill: "red",
          shape: "dot",
          text: "Stopped"
        });
      } catch (err) {
        console.log(err);
      }
    });
  }

  // Register the node by name. This must be called before overriding any of the
  // Node functions.
  RED.nodes.registerType("sendMessage", sendMessage);
}
