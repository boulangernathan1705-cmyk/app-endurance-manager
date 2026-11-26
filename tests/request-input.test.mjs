import test from 'node:test';
import assert from 'node:assert/strict';
import {returnPath, readLimitedText, body} from '../server/core.mjs';

test('local return paths keep their grammar and length limits', () => {
  for (const path of ['/', '/lmu/', '/iracing', '/foo/bar~_-.', '/#inscriptions', '/lmu/#event=12345678-1234-1234-1234-123456789abc', '/' + 'a'.repeat(199), '/simhub.html?track=Spa#memo', '/fiches-combo?car=BMW#memo']) assert.equal(returnPath(path), path);
  for (const path of [null, 123, '', '//example.com', '/foo//bar', 'https://example.com/', '/foo?x=1', '/foo#unknown', '/foo%2Fbar', '/' + 'a'.repeat(200), '/' + 'a'.repeat(190) + '!', '/simhub?redirect=https://example.com']) assert.equal(returnPath(path), '/');
});

test('bounded body reader handles byte limits and streamed requests', async () => {
  assert.equal(await readLimitedText(new Request('https://local.invalid',{method:'POST',body:'éé'}),4),'éé');
  await assert.rejects(readLimitedText(new Request('https://local.invalid',{method:'POST',body:'éé'}),3),{status:413});
  await assert.rejects(readLimitedText(new Request('https://local.invalid',{method:'POST',body:'a',headers:{'Content-Length':'9999'}}),3),{status:413});
  const chunks = [new Uint8Array([1,2]),new Uint8Array([3,4])];
  let canceled=false;
  const stream=new ReadableStream({pull(controller){if(chunks.length)controller.enqueue(chunks.shift());},cancel(){canceled=true;}});
  await assert.rejects(readLimitedText(new Request('https://local.invalid',{method:'POST',body:stream,duplex:'half'}),3),{status:413});
  assert.equal(canceled,true);
});

test('JSON validation preserves status codes', async () => {
  const request = (value, type='application/json') => new Request('https://local.invalid',{method:'POST',headers:{'Content-Type':type},body:value});
  assert.deepEqual(await body(request('{"a":1}')), {a:1});
  await assert.rejects(body(request('[]')), {status:400});
  await assert.rejects(body(request('{}','text/plain')), {status:415});
  await assert.rejects(body(request('{"a":1}'), 2), {status:413});
});
