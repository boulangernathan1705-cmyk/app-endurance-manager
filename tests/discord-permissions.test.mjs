import test from 'node:test';
import assert from 'node:assert/strict';
import {effectivePermissions,withPublicVoiceAccess,PUBLIC_VOICE_ACCESS,withBotAccess,VOICE_ACCESS,VIEW,CONNECT,ADMIN} from '../server/discord-permissions.mjs';
const guild='100000000000000001',bot='100000000000000002',pilots='100000000000000003';

test('a private category denies a globally capable bot until its member exception is allowed',()=>{
  const roles=[{id:guild,permissions:String(VOICE_ACCESS)}], member={roles:[]};
  const overwrites=[{id:guild,type:0,allow:'0',deny:String(VIEW|CONNECT)},{id:pilots,type:0,allow:String(VIEW|CONNECT),deny:'0'}];
  const before=structuredClone(overwrites);
  assert.equal(effectivePermissions(roles,member,guild,{permission_overwrites:overwrites},bot)&VIEW,0n);
  const protectedRules=withBotAccess(overwrites,bot,VOICE_ACCESS);
  assert.deepEqual(overwrites,before,'input is immutable');
  assert.deepEqual(protectedRules.slice(0,2),before,'private member/role rules are retained');
  assert.equal(effectivePermissions(roles,member,guild,{permission_overwrites:protectedRules},bot)&VOICE_ACCESS,VOICE_ACCESS);
  assert.equal(effectivePermissions(roles,{roles:[]},guild,{permission_overwrites:protectedRules},'other')&VIEW,0n,'non-pilots still cannot see');
  assert.equal(effectivePermissions(roles,{roles:[pilots]},guild,{permission_overwrites:protectedRules},'pilot')&VIEW,VIEW);
});

test('bot access merges an existing member exception without losing unrelated denied bits or duplicating it',()=>{
  const rules=[{id:bot,type:1,allow:'0',deny:String(CONNECT|(1n<<21n))}];
  const protectedRules=withBotAccess(rules,bot,VOICE_ACCESS);
  assert.equal(protectedRules.length,1);
  assert.equal(protectedRules[0].allow,String(VOICE_ACCESS));
  assert.equal(protectedRules[0].deny,String(1n<<21n));
  assert.deepEqual(withBotAccess(protectedRules,bot,VOICE_ACCESS),protectedRules);
  const rights=effectivePermissions([{id:guild,permissions:String(ADMIN)}],{roles:[]},guild,{permission_overwrites:rules},bot);
  assert.equal(rights&VOICE_ACCESS,VOICE_ACCESS,'administrator bypasses local denies');
});

test('« Gérer les permissions » is never copied (only an administrator may set it on a channel)',()=>{
  const manageRoles=1n<<28n;
  const rules=withBotAccess([{id:pilots,type:0,allow:String(manageRoles|VIEW),deny:'0'},{id:bot,type:1,allow:String(manageRoles),deny:'0'}],bot,VOICE_ACCESS);
  assert.equal(rules[0].allow,String(VIEW));
  assert.equal(BigInt(rules[1].allow)&manageRoles,0n);
});


test('public vocals remove access denies for roles and members while retaining unrelated restrictions',()=>{
  const unrelated=1n<<22n;
  const rules=[{id:guild,type:0,allow:'0',deny:String(PUBLIC_VOICE_ACCESS)},
    {id:pilots,type:0,allow:'0',deny:String(PUBLIC_VOICE_ACCESS|unrelated)},
    {id:'member',type:1,allow:'0',deny:String(PUBLIC_VOICE_ACCESS)}];
  const original=structuredClone(rules);
  const result=withPublicVoiceAccess(rules,guild,bot);
  assert.deepEqual(rules,original);
  assert.equal(result[1].deny,String(unrelated));
  for(const [id,roles] of [['visitor',[]],['member',[pilots]]]) {
    const rights=effectivePermissions([{id:guild,permissions:'0'}],{roles},guild,{permission_overwrites:result},id);
    assert.equal(rights&PUBLIC_VOICE_ACCESS,PUBLIC_VOICE_ACCESS);
  }
  assert.deepEqual(withPublicVoiceAccess(result,guild,bot),result);
});

test('crew vocals allow voice activation even when guild, role and member rules require push to talk',()=>{
  const voiceActivation=1n<<25n, muteMembers=1n<<22n;
  const rules=[{id:guild,type:0,allow:'0',deny:String(voiceActivation)},
    {id:pilots,type:0,allow:'0',deny:String(voiceActivation|muteMembers)},
    {id:'pilot',type:1,allow:'0',deny:String(voiceActivation)}];
  const result=withPublicVoiceAccess(rules,guild,bot);
  for(const [id,roles] of [['visitor',[]],['pilot',[pilots]]]) {
    const rights=effectivePermissions([{id:guild,permissions:'0'}],{roles},guild,{permission_overwrites:result},id);
    assert.equal(rights&voiceActivation,voiceActivation,'voice activity must be explicitly granted');
    assert.equal(rights&muteMembers,0n,'moderation permissions must not be granted');
  }
  assert.equal(result[1].deny,String(muteMembers));
});

test('ordinary vocal features work despite guild, role and member denies without granting moderation',()=>{
  const features={invites:0,reactions:6,screenAndCamera:9,view:10,chat:11,tts:12,links:14,files:15,history:16,
    externalEmojis:18,connect:20,speak:21,voiceActivity:25,commands:31,externalStickers:37,activities:39,
    soundboard:42,externalSounds:45,voiceMessages:46,voiceStatus:48,polls:49,externalApps:50};
  const expected=Object.values(features).reduce((bits,bit)=>bits|(1n<<BigInt(bit)),0n);
  const moderation=[1,2,3,4,5,8,13,17,22,23,24,28,29,40];
  const deniedModeration=moderation.reduce((bits,bit)=>bits|(1n<<BigInt(bit)),0n);
  const rules=[{id:guild,type:0,allow:'0',deny:String(expected)},
    {id:pilots,type:0,allow:'0',deny:String(expected|deniedModeration)},
    {id:'pilot',type:1,allow:'0',deny:String(expected)}];
  const result=withPublicVoiceAccess(rules,guild,bot);
  for(const [id,roles] of [['visitor',[]],['pilot',[pilots]]]) {
    const rights=effectivePermissions([{id:guild,permissions:'0'}],{roles},guild,{permission_overwrites:result},id);
    for(const [name,bit] of Object.entries(features)) assert.ok(rights&(1n<<BigInt(bit)),name);
    assert.equal(rights&deniedModeration,0n,'normal members do not gain moderation or mass mentions');
  }
  assert.equal(BigInt(result[1].deny),deniedModeration&~(1n<<28n),'non-assignable Manage Roles is stripped by the shared helper');
  assert.deepEqual(withPublicVoiceAccess(result,guild,bot),result,'repeated repair is stable');
});
