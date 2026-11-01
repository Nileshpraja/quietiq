import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src = new URL('../site/js/', import.meta.url);
const asModule = async name => import('data:text/javascript;base64,' + (await readFile(new URL(name,src))).toString('base64'));
const memory = new Map();
const local = new Map();
globalThis.localStorage = {
  getItem: key => local.get(key) ?? null,
  setItem: (key,value) => {local.set(key,String(value));},
  removeItem: key => {local.delete(key);}
};
globalThis.document = {getElementById:()=>null};

// Tiny async test double matching the IndexedDB interactions used by QuietIQ.
const db = {
  objectStoreNames: {contains: name => name === 'recordings'},
  createObjectStore() {},
  close() {},
  transaction() {
    const tx = {oncomplete:null, onerror:null};
    const finish = ()=>queueMicrotask(()=>tx.oncomplete?.());
    tx.objectStore = () => ({
      getAll() {
        const req={onsuccess:null,onerror:null,result:[]};
        queueMicrotask(()=>{req.result=[...memory.values()];req.onsuccess?.();});
        return req;
      },
      put: record => {memory.set(record.id, record);finish();},
      delete: id => {memory.delete(id);finish();}
    });
    return tx;
  }
};
globalThis.indexedDB = {
  open() {
    const req={result:db, onupgradeneeded:null, onsuccess:null, onerror:null};
    queueMicrotask(()=>req.onsuccess?.());
    return req;
  }
};
class FakeRecorder {
  static isTypeSupported(t) {return t.includes('audio/webm');}
  constructor(stream, options) {this.state='inactive';this.mimeType=options.mimeType;}
  start() {
    this.state='recording';
    queueMicrotask(()=>this.ondataavailable?.({data:new Blob(['some sample microphone bytes'.repeat(5)],{type:this.mimeType})}));
  }
  stop() {this.state='inactive';queueMicrotask(()=>this.onstop?.());}
}
globalThis.MediaRecorder = FakeRecorder;
globalThis.window = {indexedDB, MediaRecorder:FakeRecorder};
globalThis.MediaStream = class {constructor(tracks){this.tracks=tracks;}};

const history = await asModule('local_history.js');
history.addHistoryEvent({kind:'session_started',faces:3,possible_speakers:1,relative_sound:25});
assert.equal(history.listHistoryEvents(1)[0].faces,3);
history.clearHistoryEvents();
assert.equal(history.listHistoryEvents().length,0);

const {TeacherAudioLibrary} = await asModule('audio_archive.js');
const archive = new TeacherAudioLibrary();
const track={enabled:true, muted:false, readyState:'live'};
await archive.start({getAudioTracks:()=>[track]});
await new Promise(resolve=>setTimeout(resolve,5));
await archive.stop(true);
assert.equal(memory.size,1,'audio should be stored locally');
assert.ok([...memory.values()][0].blob instanceof Blob);
await archive.start({getAudioTracks:()=>[track]});
await new Promise(resolve=>setTimeout(resolve,5));
await archive.stop(false);
assert.equal(memory.size,1,'audio must be discarded when consent is withdrawn');
await archive.deleteAll();
assert.equal(memory.size,0,'clips can be deleted');
console.log('Browser-local audio/history tests passed');
