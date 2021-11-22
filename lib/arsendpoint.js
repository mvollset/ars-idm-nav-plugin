'use strict'

const issuehandler = require('./arshandler');

module.exports = {
    name: "arsPlugin",
    register: async (server, options) => {


        server.route([
            {
                method: "GET",
                path: `/${options.root}/hello`,
                handler: async () => {
                    return "Hello, ARS";

                }
            },
            {
                method: "POST",
                path: `/${options.root}/createissue`,
                handler: issuehandler.createIssueHandler
            },
            {
                method: "POST",
                path: `/${options.root}/commentissue`,
                handler: issuehandler.commentIssueHandler
            },
            {
                method: "POST",
                path: `/${options.root}/resolveissue`,
                handler: issuehandler.resolveIssueHandler
            },
            {
                method: "GET",
                path: `/${options.root}/lasterror/{key?}`,
                handler: issuehandler.lastErrorHandler
            }
        ]);
    }
}