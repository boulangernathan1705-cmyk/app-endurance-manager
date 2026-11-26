import {test, expect} from '@playwright/test';

test('the admin cropper keeps banner and avatar dimensions and restores the preview on cancel', async ({page}) => {
  await page.goto('/mur.html');
  const result = await page.evaluate(async () => {
    const {openCropper, closeCropper, cropCanvas, setZoom, bannerImage, botImage} =
      await import('/front/admin/image-cropper.mjs');
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 16;
    source.getContext('2d').fillRect(0, 0, 32, 16);
    const file = await new Promise(resolve => source.toBlob(resolve, 'image/png'));
    const checks = [];
    for (const kind of ['banner','bot']) {
      const container = document.createElement('div');
      container.dataset.imageKind = kind;
      container.innerHTML = '<div class="settings-banner-preview"></div>';
      document.body.append(container);
      await openCropper(file, container);
      const canvas = cropCanvas();
      setZoom(2);
      const image = await (kind === 'bot' ? botImage(canvas) : bannerImage(canvas));
      const preview = container.firstElementChild;
      const hiddenDuringCrop = preview.hidden;
      closeCropper(container);
      checks.push({size:[canvas.width,canvas.height], type:image.type, hiddenDuringCrop,
        restored:!preview.hidden && !container.querySelector('.banner-cropper') && !cropCanvas()});
      container.remove();
    }
    return checks;
  });
  expect(result[0]).toEqual({size:[2048,512], type:expect.stringMatching(/^image\/(webp|jpeg)$/), hiddenDuringCrop:true, restored:true});
  expect(result[1]).toEqual({size:[512,512], type:'image/png', hiddenDuringCrop:true, restored:true});
});
