'use strict'

const Storage = require('node-persist');
const config = require('../config')();
const mapper = require('../datamapper/mapper');
const Boom = require('boom');
const insightClient = require('../jira/insightClient') ({
    url: config.jiraRoot,
    username: config.jiraAuth.user,
    password: config.jiraAuth.password
});
const jiraClient = require('../jira/jiraClient') ({
    url: config.jiraRoot,
    username: config.jiraAuth.user,
    password: config.jiraAuth.password
});
function throwReadableErrormessage(message,jiraerror){
    let statusCode = jiraerror.statusCode;
    let messages =[message];
    if(jiraerror.error&&jiraerror.error.errors){
        for(let inner in jiraerror.error.errors){
            messages.push(`field: ${inner} - error: ${jiraerror.error.errors[inner]}`)
        }
    }
    throw new Boom(messages.join(','),{
        statusCode:statusCode,
        message:message
    });
}
const storage = Storage.create({
    dir: './errorstorage/ars', 
    ttl: true,
    expiredInterval: 2*60*1000,
    stringify: JSON.stringify,
    parse: JSON.parse
});
storage.init();

/*async function extractSupportGroup(supportGroup) {
    let supportgroupId = await insightClient.getSupportGroupPromise(supportGroup);
    return supportgroupId;
}*/

function mapData(mapConfig, data){
    let map = mapper.create(mapConfig);
    let remap = jiraClient.getCustomFieldsMap();
    if(remap !== false){
        remap = mapper.create(remap);
    }

    return map.map(data);
}

async function persistError(key, message) {
    let value = {};
    value.message = message;
    value.timestamp = new Date().toISOString();
    await storage.setItem(key, value);
}

module.exports.createIssueHandler = async (request, h) => {
    try{
        let jissue = {};
        jissue.arsid = `${request.payload.arsid}`;
        jissue.summary = request.payload.summary;
        jissue.description = request.payload.description;
        //jissue.supportgroup = await extractSupportGroup(request.payload.supportgroup);
        request.log(["debug","prf","ident"], {message:"Start insightlookup"});
        if(request.payload.reporter!="AR_ESCALATOR"){
			const reporter = await insightClient.getUserPromise(request.payload.reporter);
			if(reporter === false) {
				request.log(["error","ident"],{message:`Could not find reporter ${request.payload.reporter}`});
				await persistError(jissue.arsid, `Could not find reporter ${request.payload.reporter}`);
				throwReadableErrormessage(`Could not find reporter ${request.payload.reporter}`,{statusCode:404});
			}
		}
		jissue.reporter= request.payload.reporter=="AR_ESCALATOR"?"srvjirasd":request.payload.reporter;
        let insightLookupOK = true;
        let messages =[];
        const [supportgroup,insightUser,insightService,insightCategory]= await Promise.all([
            insightClient.getSupportGroupPromise(request.payload.supportgroup),
            insightClient.getUserPromise(request.payload.affecteduser),
            insightClient.getServicePromise(config.idm.service),
            insightClient.getCategoryPromise(config.idm.category)

        ]);
        request.log(["debug","prf","ident"], {message:"End insightlookup"});
        const userProperties = {
            nav_id: request.payload.affecteduser, 
            name:request.payload.affecteduserfullname,
            trygde_id:request.payload.affectedusertrygdeid,
            ansatt_sektor:request.payload.affectedusersector=="Eksternt"?"Ekstern":request.payload.affectedusersector,
            enhet:request.payload.affecteduserenhet
        };
        if(insightUser === false){
            try{
            const insightUser = await insightClient.createUserPromise(userProperties);
            jissue.affectedUser =  insightUser.objectKey;
            }
            catch(err){
                request.log(["error","ident"],{message:"Could not create user",error:err});
                throwReadableErrormessage(`Could not create user `, { statusCode: 500,message:err });
            }
        }
        else{
            jissue.affectedUser = insightUser;
            try{
                await insightClient.updateUserPromise(insightUser,userProperties);
            }
            catch(err){
                request.log(["warn","ident"],{message:"Could not update user",error:err});
            }
        }
        if(insightService===false){
            insightLookupOK=false;
            messages.push(`Could not find service ${config.idm.service}`);
            
        }
        jissue.service = insightService;
        if(supportgroup===false){
            insightLookupOK=false;
            messages.push(`Could not find Supportgroup ${request.payload.supportgroup}`);
        } 
        jissue.supportgroup = supportgroup;
        if(insightCategory===false){
            insightLookupOK=false;
            messages.push(`Could not find Category ${config.idm.category}`);
        }
        jissue.category = insightCategory;
        if(!insightLookupOK){
            throwReadableErrormessage(messages.join(' ,'),{statusCode:404});
        }
        try{
            const data = mapData(config.maps.arsServiceRequest, jissue);
            request.log(["debug","prf","ident"], {message:"Start create"});
            let issue = await jiraClient.createIssuePromise(data);
            request.log(["debug","prf","ident"], {message:"End create"});
            return h.response(issue).code(201); 
    
        }
        catch(err) {
            request.log(['error','ident'],{message:'Error when creating issue',error:err });
            throwReadableErrormessage('Error when creating issue',err);
        }

    }
    catch(err) {
        let arsid = request.payload.arsid || "createissue_unknown";
        await persistError(arsid, err.message);
        return err;
    }

}
module.exports.commentIssueHandler = async (request, h) => {
    try {
        let comment = await jiraClient.addSDCommentPromise(request.payload.issuekey, request.payload.comment);
        return h.response(comment).code(201);
    } catch(err) {
        let key = request.payload.issuekey || "commentissue_unknown";
        await persistError(key, err.message);
        return h.response(err).code(500);
    }
    
}
module.exports.resolveIssueHandler = async (request, h) => {
    let transitionId;
    let issuekey = request.payload.issuekey;
    try{
        
        let meta = await jiraClient.getTransitionsPromise(issuekey);
        
        for(let i=0; i< meta.transitions.length; i++) {
            if( meta.transitions[i].to.id === "5") {
                transitionId = meta.transitions[i].id;
                break;
            }
        }
    } catch (err) {
        return err;
    }
    if(!transitionId){
        await persistError(issuekey, "Not allowed to resolve issue");
        return h.response({message: "Not allowed to resolve issue"}).code(403);
    }
    const data = {
        transitionid:transitionId
    };
    
    let payload = mapData(config.maps.transitionIssue, data);
    if(request.payload.comment){
        payload.update = {
            comment :[{
                add:{
                    body:request.payload.comment
                }
            }
            ]
        }
    }
    try {
        await jiraClient.transitionIssuePromise(issuekey, payload); 
        return h.response({message: "issue transitioned"}).code(204);
    } catch (err) {
        await persistError(issuekey, err.message);
        return h.response(JSON.stringify(err)).code(500);
    }
}
module.exports.lastErrorHandler = async (request, h) => {
    const params = request.params || {};
    let resp = [];

    if(params.key){
        let obj = {};
        obj.key = params.key;
        obj.value = JSON.stringify(await storage.getItem(params.key));
        resp.push(obj);
    } else {
        await storage.forEach(async (e) => {
            let obj = {};
            obj.key = e.key;
            obj.value = JSON.stringify(e.value);
            resp.push(obj);
        });
    }
    
    return h.response(resp).code(200);
}