const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 图片目录
const pngDir = path.join(__dirname, 'png');

// 压缩图片的函数
async function compressImage(inputPath, outputPath) {
  try {
    // 读取原始图片文件大小
    const inputStats = fs.statSync(inputPath);
    const inputSize = inputStats.size;
    console.log(`压缩前 ${path.basename(inputPath)}: 大小: ${(inputSize / 1024).toFixed(2)} KB`);
    
    // 压缩图片，保持宽度和高度不变，质量设置为60（更小的文件大小）
    await sharp(inputPath)
      .png({ quality: 60 })
      .toFile(outputPath);
    
    // 读取压缩后图片文件大小
    const outputStats = fs.statSync(outputPath);
    const outputSize = outputStats.size;
    console.log(`压缩后 ${path.basename(outputPath)}: 大小: ${(outputSize / 1024).toFixed(2)} KB`);
    console.log(`压缩率: ${((1 - outputSize / inputSize) * 100).toFixed(2)}%`);
    console.log('------------------------');
  } catch (error) {
    console.error(`压缩图片 ${inputPath} 时出错:`, error);
  }
}

// 遍历目录中的所有图片文件
async function compressAllImages() {
  try {
    const files = fs.readdirSync(pngDir);
    
    for (const file of files) {
      if (path.extname(file).toLowerCase() === '.png') {
        const inputPath = path.join(pngDir, file);
        const outputPath = path.join(pngDir, `compressed-${file}`);
        
        await compressImage(inputPath, outputPath);
        
        // 替换原始文件
        fs.unlinkSync(inputPath);
        fs.renameSync(outputPath, inputPath);
      }
    }
    
    console.log('所有图片压缩完成！');
  } catch (error) {
    console.error('压缩图片时出错:', error);
  }
}

// 执行压缩
compressAllImages();
