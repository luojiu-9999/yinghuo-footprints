import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, validateRecord, validateLayouts, assertBackupCapacity, LIMITS } from '../src/backup.js';
import { seedRecords } from '../src/data.js';
const fixture = () => ({ records: [structuredClone(seedRecords[0])], marks: [] });
test('metadata admission is bounded while binary originals are not mistaken for JSON size',()=>{
  assert.ok(assertBackupCapacity(fixture(),[],['photo-id'])<LIMITS.manifestBytes);
  assert.throws(()=>assertBackupCapacity(fixture(),[],Array.from({length:5000},(_,i)=>'original-'+i)),/32 MiB/);
});
test('101 attractions survive the shared recording and restore rules without truncation', () => {
  const r = { ...seedRecords[0], attractions: Array.from({ length: 101 },(_,i)=>'地点'+i) };
  assert.equal(validateRecord(r).attractions.length,101);
  assert.equal(validateBackup(JSON.parse(JSON.stringify({ records:[r],marks:[] }))).records[0].attractions.length,101);
  assert.throws(()=>validateRecord({ ...r,attractions:Array(LIMITS.attractions+1).fill('地点') }));
});
test('province/city/county relationships and names must match the local administrative index', () => {
  for(const patch of [{provinceCode:110000,provinceName:'北京市'},{districtCodes:[440106],districtNames:['天河区']},{cityCode:123456},{cityName:'不存在的城市'}]) assert.throws(()=>validateRecord({...seedRecords[0],...patch}));
});
test('municipalities, SARs and province-administered cities retain their actual hierarchy', () => {
  const r={...seedRecords[0],provinceCode:110000,provinceName:'北京市',cityCode:110000,cityName:'北京市',districtCodes:[110101],districtNames:['东城区']}; assert.equal(validateRecord(r).cityCode,110000);
  assert.equal(validateRecord({...r,provinceCode:810000,provinceName:'香港特别行政区',cityCode:810000,cityName:'香港特别行政区',districtCodes:[810001],districtNames:['中西区']}).cityCode,810000);
  assert.equal(validateRecord({...r,provinceCode:420000,provinceName:'湖北省',cityCode:429004,cityName:'仙桃市',districtCodes:[],districtNames:[]}).cityCode,429004);
});
test('manual footprint ancestry cannot claim a different province or city', () => {
  const b=fixture();b.marks=[{code:440106,name:'天河区',level:'district',date:'2026-10-26',path:[{code:100000,name:'中国',level:'country'},{code:110000,name:'北京市',level:'province'},{code:330100,name:'杭州市',level:'city'}]}];assert.throws(()=>validateBackup(b));
});
test('municipality city footprints accept the app synthetic city wrapper without a false ancestry error',()=>{
  const b=fixture();b.marks=[{code:110000,name:'北京市',level:'city',date:'2026-10-26',path:[{code:100000,name:'中国',level:'country'},{code:110000,name:'北京市',level:'province'}]}];assert.equal(validateBackup(b).marks[0].code,110000);
});
test('both collage modes keep distinct photo/crop configurations and reject foreign hierarchy', () => {
  const layout={mapCode:100000,regionCode:330000,mode:'single',single:{photos:['/assets/hangzhou.png'],crops:{'/assets/hangzhou.png':{x:35,y:60,zoom:1.4}}},multi:{photos:['/assets/hangzhou.png','/assets/dali.png'],columns:2}};
  const clean=validateLayouts([layout])[0];assert.equal(clean.single.photos.length,1);assert.equal(clean.multi.photos.length,2);assert.equal(clean.single.crops['/assets/hangzhou.png'].x,35);
  assert.deepEqual(validateLayouts([{...layout,mode:'multi'}])[0].single,clean.single);
  assert.throws(()=>validateLayouts([{...layout,mapCode:330100,regionCode:440106}]));
});
test('new photo references, grouping and same-day order survive JSON validation', () => {
  const r=validateRecord({...seedRecords[0],photos:['photo:test-original'],tripName:'江南之旅',visitOrder:2});assert.equal(r.photos[0],'photo:test-original');assert.equal(r.tripName,'江南之旅');assert.equal(r.visitOrder,2);
});
