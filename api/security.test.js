import test from 'node:test';
import assert from 'node:assert/strict';
import { adminView, publicView } from './index.js';

test('public product catalog never exposes VIP prices or internal data', () => {
  const products=[{
    id:7,name:'Cards',image:'',subCategoryId:1,
    pricesB:{1000:70},pricesVIP:{1000:50},supplierCost:10,pass:'bad'
  }];
  const publicProducts=publicView('products',products);
  assert.deepEqual(publicProducts,[{
    id:7,name:'Cards',image:'',categoryId:undefined,subCategoryId:1,pricesB:{1000:70}
  }]);
  assert.equal(JSON.stringify(publicProducts).includes('pricesVIP'),false);
  assert.equal(JSON.stringify(publicProducts).includes('supplierCost'),false);
});
test('admin lists remove historical plaintext customer/employee credentials',()=>{
  const rows=[{id:1,name:'Customer',phone:'01000000001',pass:'old-secret',password:'another-secret'}];
  for(const resource of ['clients','employees']) {
    const clean=adminView(resource,rows);
    assert.equal(clean[0].name,'Customer');
    assert.equal(clean[0].pass,undefined);
    assert.equal(clean[0].password,undefined);
    assert.equal(rows[0].pass,'old-secret');
  }
});
