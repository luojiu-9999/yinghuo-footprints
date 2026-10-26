import sharp from 'sharp';
const source = await sharp('docs/design-reference.png').resize(1440, 1024).toBuffer();
const implementation = await sharp('qa/desktop-theme-selector.png').resize(1440, 1024).toBuffer();
for (const [name, crop] of [['header', { left: 0, top: 0, width: 640, height: 82 }], ['theme', { left: 990, top: 70, width: 450, height: 270 }]]) {
  await sharp({ create: { width: crop.width * 2, height: crop.height, channels: 3, background: '#fff' } }).composite([{ input: await sharp(source).extract(crop).toBuffer(), left: 0, top: 0 }, { input: await sharp(implementation).extract(crop).toBuffer(), left: crop.width, top: 0 }]).png().toFile(`qa/${name}-comparison.png`);
}
