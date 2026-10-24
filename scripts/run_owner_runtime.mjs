#!/usr/bin/env node
import {createLocalApiServer} from '../frontend/server.js';
const server=createLocalApiServer({serveBuild:true});
server.listen(4300,'127.0.0.1',()=>console.log('Atlas owner runtime: http://127.0.0.1:4300 — paper only'));
