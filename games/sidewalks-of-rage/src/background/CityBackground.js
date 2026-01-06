import Phaser from 'phaser';

export default function createCityBackground(scene) {
  const { width, height } = scene.scale;
  const layer = scene.add.container(0, 0);
  layer.setDepth(-1000);

  const sky = scene.add.graphics();
  sky.fillGradientStyle(0x0b1a3a, 0x0b1a3a, 0x2c0b3d, 0x2c0b3d, 1);
  sky.fillRect(0, 0, width, height);
  layer.add(sky);

  const sidewalkHeight = Math.round(height * 0.3);
  const horizonY = height - sidewalkHeight;

  const farMinWidth = Math.max(26, Math.round(width * 0.035));
  const farMaxWidth = Math.max(farMinWidth + 18, Math.round(width * 0.08));
  const nearMinWidth = Math.max(40, Math.round(width * 0.055));
  const nearMaxWidth = Math.max(nearMinWidth + 20, Math.round(width * 0.12));

  addBuildingRow(scene, layer, {
    baseY: horizonY + sidewalkHeight * 0.05,
    minWidth: farMinWidth,
    maxWidth: farMaxWidth,
    minHeight: Math.round(height * 0.18),
    maxHeight: Math.round(height * 0.42),
    color: 0x141a2a,
    spacingMin: 4,
    spacingMax: 12
  });

  addBuildingRow(scene, layer, {
    baseY: horizonY + sidewalkHeight * 0.18,
    minWidth: nearMinWidth,
    maxWidth: nearMaxWidth,
    minHeight: Math.round(height * 0.24),
    maxHeight: Math.round(height * 0.55),
    color: 0x0b0f1c,
    spacingMin: 6,
    spacingMax: 16
  });

  const billboardCount = Phaser.Math.Between(2, 3);
  const billboardMinWidth = Math.max(140, Math.round(width * 0.2));
  const billboardMaxWidth = Math.max(billboardMinWidth + 20, Math.round(width * 0.32));
  const billboardMinHeight = Math.max(34, Math.round(height * 0.05));
  const billboardMaxHeight = Math.max(billboardMinHeight + 10, Math.round(height * 0.08));

  for (let i = 0; i < billboardCount; i += 1) {
    const billboardWidth = Phaser.Math.Between(billboardMinWidth, billboardMaxWidth);
    const billboardHeight = Phaser.Math.Between(billboardMinHeight, billboardMaxHeight);
    const billboardX = Phaser.Math.Between(12, Math.max(12, width - billboardWidth - 12));
    const billboardY = Phaser.Math.Between(Math.round(height * 0.18), Math.round(height * 0.42));

    const billboard = scene.add.rectangle(billboardX, billboardY, billboardWidth, billboardHeight, 0x1c2133);
    billboard.setOrigin(0, 0);
    billboard.setStrokeStyle(2, 0x4c5466);
    layer.add(billboard);

    const billboardText = scene.add.text(
      billboardX + billboardWidth / 2,
      billboardY + billboardHeight / 2,
      'YOUR AD HERE',
      {
        fontFamily: 'Verdana',
        fontSize: `${Math.max(12, Math.round(billboardHeight * 0.35))}px`,
        color: '#e6e6e6'
      }
    );
    billboardText.setOrigin(0.5);
    layer.add(billboardText);
  }

  const storefrontCount = Phaser.Math.Between(2, 3);
  const storefrontMinWidth = Math.max(120, Math.round(width * 0.16));
  const storefrontMaxWidth = Math.max(storefrontMinWidth + 20, Math.round(width * 0.26));
  const storefrontMinHeight = Math.max(34, Math.round(height * 0.05));
  const storefrontMaxHeight = Math.max(storefrontMinHeight + 8, Math.round(height * 0.08));

  for (let i = 0; i < storefrontCount; i += 1) {
    const storefrontWidth = Phaser.Math.Between(storefrontMinWidth, storefrontMaxWidth);
    const storefrontHeight = Phaser.Math.Between(storefrontMinHeight, storefrontMaxHeight);
    const storefrontX = Phaser.Math.Between(16, Math.max(16, width - storefrontWidth - 16));
    const storefrontY = horizonY - storefrontHeight - Phaser.Math.Between(6, 16);

    const storefront = scene.add.rectangle(
      storefrontX,
      storefrontY,
      storefrontWidth,
      storefrontHeight,
      0x242424
    );
    storefront.setOrigin(0, 0);
    storefront.setStrokeStyle(2, 0x3f3f3f);
    layer.add(storefront);

    const storefrontText = scene.add.text(
      storefrontX + storefrontWidth / 2,
      storefrontY + storefrontHeight / 2,
      'STOREFRONT',
      {
        fontFamily: 'Verdana',
        fontSize: `${Math.max(11, Math.round(storefrontHeight * 0.35))}px`,
        color: '#d8d8d8'
      }
    );
    storefrontText.setOrigin(0.5);
    layer.add(storefrontText);
  }

  const ground = scene.add.graphics();
  ground.fillStyle(0x2a2a2a, 1);
  ground.fillRect(0, horizonY, width, sidewalkHeight);
  ground.fillStyle(0x3a3a3a, 1);
  ground.fillRect(0, horizonY, width, Math.round(sidewalkHeight * 0.38));
  ground.lineStyle(2, 0x555555, 0.8);
  ground.beginPath();
  ground.moveTo(0, horizonY + Math.round(sidewalkHeight * 0.38));
  ground.lineTo(width, horizonY + Math.round(sidewalkHeight * 0.38));
  ground.strokePath();
  layer.add(ground);
}

function addBuildingRow(scene, layer, options) {
  const { width } = scene.scale;
  const {
    baseY,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    color,
    spacingMin,
    spacingMax
  } = options;

  const graphics = scene.add.graphics();
  graphics.fillStyle(color, 1);

  let x = -Phaser.Math.Between(0, Math.round(maxWidth * 0.5));
  while (x < width) {
    const buildingWidth = Phaser.Math.Between(minWidth, maxWidth);
    const buildingHeight = Phaser.Math.Between(minHeight, maxHeight);
    const buildingY = baseY - buildingHeight;

    graphics.fillRect(x, buildingY, buildingWidth, buildingHeight);
    x += buildingWidth + Phaser.Math.Between(spacingMin, spacingMax);
  }

  layer.add(graphics);
}
