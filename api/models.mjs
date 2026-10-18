import {freeModels,presets} from '../server/models.mjs';
import {failure} from '../server/security.mjs';
export default async function handler(req,res){try{if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});const models=await freeModels();res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');res.status(200).json({models,presets:presets(models),checkedAt:new Date().toISOString()});}catch(e){failure(res,e);}}
