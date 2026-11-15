import test from 'node:test';
import assert from 'node:assert/strict';
import {inline,markdown} from '../public/render.js';
test('source table line breaks render without allowing attributes or changing literal code',()=>{
 assert.equal(inline('one<br>two<BR />three'),'one<br>two<br>three');
 assert.equal(inline('`<br>`'),'<code>&lt;br&gt;</code>');
 assert.equal(inline('<br onmouseover="alert(1)">'), '&lt;br onmouseover=&quot;alert(1)&quot;&gt;');
 assert.equal(inline('<script>alert(1)</script>'),'&lt;script&gt;alert(1)&lt;/script&gt;');
 assert.match(markdown('|Requirement|\n|---|\n|First<br>Second|'), /<td>First<br>Second<\/td>/);
});
