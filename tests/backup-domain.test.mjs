import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, mergeBackup } from '../src/backup.js';
import { seedRecords, ROOT, ZHEJIANG, HANGZHOU, totalStats, cityFootprints } from '../src/data.js';
const fixture = () => ({ records: structuredClone(seedRecords), marks: [] });
test('legacy and versioned backups retain all content', () => {
  assert.deepEqual(validateBackup(fixture()).records.map(r => r.photos), seedRecords.map(r => r.photos));
  assert.equal(validateBackup({ ...fixture(), app:'yinghuo-footprints',schemaVersion:2 }).records.length,2);
});
test('invalid backup structures, dates, duplicate IDs and unsafe photo sources are rejected', () => {
  for (const mutate of [b=>b.records=null,b=>b.records.push(b.records[0]),b=>b.records[0].date='2026-02-30',b=>b.records[0].photos=['javascript:alert(1)'],b=>b.records[0].photos=['https://tracking.invalid/photo'],b=>b.records[0].districtNames=[],b=>b.records[0].days=0,b=>b.records[0].cityCode=NaN,b=>b.schemaVersion=99]) {
    const backup=fixture();mutate(backup);assert.throws(()=>validateBackup(backup));
  }
});
test('merging preserves current same-ID edits and adds genuinely new records and marks', () => {
  const current=fixture();current.records[0].title='当前版本';
  const incoming=fixture();incoming.records[0].title='旧备份';incoming.records.push({...incoming.records[0],id:'new-record'});
  const merged=mergeBackup(current,incoming);
  assert.equal(merged.records.length,3);assert.equal(merged.records.find(r=>r.id===current.records[0].id).title,'当前版本');
});
test('manual county mark derives its parent city and region statistics without a trip', () => {
  const county={code:330106,name:'西湖区',level:'district',path:[ROOT,ZHEJIANG,HANGZHOU]};
  const stats=totalStats([],[county]);assert.equal(stats.cities,1);assert.equal(stats.counties,1);assert.equal(stats.provinces,1);
  const cities=cityFootprints([],[county]);assert.equal(cities.length,1);assert.equal(cities[0].code,330100);assert.equal(cities[0].provinceName,'浙江省');
});
test('municipality county mark counts the municipality as both a province and a city', () => {
  const beijing={code:110000,name:'北京市',level:'province',path:[ROOT]};
  const mark={code:110101,name:'东城区',level:'district',path:[ROOT,beijing]};
  assert.equal(totalStats([],[mark]).cities,1);assert.equal(cityFootprints([],[mark])[0].code,110000);
});
