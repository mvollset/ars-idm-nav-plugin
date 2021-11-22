'use strict';
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const arshandler = require('./lib/arshandler');
const optionsModel = Joi.object({
    root:Joi.string().required()
})
exports.plugin = {
    name: "ARSPlugin",
    pkg: require('./package.json'),
    register: async function (server, options) {

     
            const { error, value } = optionsModel.validate(options);
            if(error){
                console.error(error.message);
                throw error
            }
                
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
                    handler: arshandler.createIssueHandler
                },
                {
                    method: "POST",
                    path: `/${options.root}/commentissue`,
                    handler: arshandler.commentIssueHandler
                },
                {
                    method: "POST",
                    path: `/${options.root}/resolveissue`,
                    handler: arshandler.resolveIssueHandler
                },
                {
                    method: "GET",
                    path: `/${options.root}/lasterror/{key?}`,
                    handler: arshandler.lastErrorHandler
                }
            ]);

       
    }
};