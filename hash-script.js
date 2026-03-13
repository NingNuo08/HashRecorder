const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RECORDS_DIR = 'hash_records';
const FILE_LOG = 'hash_log.txt';
const FOLDER_LOG = 'folder_log.txt';
const FILE_LOG_PATH = path.join(RECORDS_DIR, FILE_LOG);
const FOLDER_LOG_PATH = path.join(RECORDS_DIR, FOLDER_LOG);

function ensureRecordsDirectory() {
    if (!fs.existsSync(RECORDS_DIR)) {
        fs.mkdirSync(RECORDS_DIR, { recursive: true });
        console.log(`[+] 已创建记录目录: ${RECORDS_DIR}`);
    }
    
    if (!fs.existsSync(FILE_LOG_PATH)) {
        fs.writeFileSync(FILE_LOG_PATH, '', 'utf8');
        console.log(`[+] 已创建文件记录: ${FILE_LOG_PATH}`);
    }
    
    if (!fs.existsSync(FOLDER_LOG_PATH)) {
        fs.writeFileSync(FOLDER_LOG_PATH, '', 'utf8');
        console.log(`[+] 已创建文件夹记录: ${FOLDER_LOG_PATH}`);
    }
}

function formatTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function calculateSHA256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const fileSize = fs.statSync(filePath).size;
        let bytesRead = 0;
        let lastProgress = 0;
        
        const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
        
        stream.on('data', (chunk) => {
            hash.update(chunk);
            bytesRead += chunk.length;
            
            if (fileSize > 10 * 1024 * 1024) {
                const progress = Math.floor((bytesRead / fileSize) * 100);
                if (progress >= lastProgress + 10) {
                    console.log(`  计算进度: ${progress}%`);
                    lastProgress = progress;
                }
            }
        });
        
        stream.on('end', () => {
            const digest = hash.digest('hex');
            resolve(digest);
        });
        
        stream.on('error', (err) => {
            reject(err);
        });
    });
}

function appendFileRecord(filePath, fileName, timestamp, hashValue) {
    const record = `${filePath},${fileName},${timestamp},${hashValue}\n`;
    fs.appendFileSync(FILE_LOG_PATH, record, 'utf8');
}

function appendFolderRecord(folderPath, folderName, timestamp, hashValue, fileCount) {
    const record = `${folderPath},${folderName},${timestamp},${hashValue},${fileCount}\n`;
    fs.appendFileSync(FOLDER_LOG_PATH, record, 'utf8');
}

function parseTimestamp(timestamp) {
    const match = timestamp.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (match) {
        return new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
        );
    }
    return new Date(0);
}

function findFileRecord(filePath) {
    if (!fs.existsSync(FILE_LOG_PATH)) {
        return null;
    }
    
    const content = fs.readFileSync(FILE_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    const records = [];
    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
            const recordedPath = parts[0];
            const recordedName = parts[1];
            const recordedTime = parts[2];
            const recordedHash = parts[3];
            
            if (recordedPath === filePath) {
                records.push({
                    path: recordedPath,
                    name: recordedName,
                    time: recordedTime,
                    hash: recordedHash,
                    timestamp: parseTimestamp(recordedTime)
                });
            }
        }
    }
    
    if (records.length === 0) {
        return null;
    }
    
    records.sort((a, b) => b.timestamp - a.timestamp);
    return records[0];
}

function findFolderRecord(folderPath) {
    if (!fs.existsSync(FOLDER_LOG_PATH)) {
        return null;
    }
    
    const content = fs.readFileSync(FOLDER_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    const records = [];
    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 5) {
            const recordedPath = parts[0];
            const recordedName = parts[1];
            const recordedTime = parts[2];
            const recordedHash = parts[3];
            const recordedFileCount = parseInt(parts[4], 10);
            
            if (recordedPath === folderPath) {
                records.push({
                    path: recordedPath,
                    name: recordedName,
                    time: recordedTime,
                    hash: recordedHash,
                    fileCount: recordedFileCount,
                    timestamp: parseTimestamp(recordedTime)
                });
            }
        }
    }
    
    if (records.length === 0) {
        return null;
    }
    
    records.sort((a, b) => b.timestamp - a.timestamp);
    return records[0];
}

function getAllFiles(dirPath, arrayOfFiles = [], errors = []) {
    try {
        const files = fs.readdirSync(dirPath);
        
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            
            try {
                fs.accessSync(fullPath, fs.constants.R_OK);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    getAllFiles(fullPath, arrayOfFiles, errors);
                } else if (stats.isFile()) {
                    arrayOfFiles.push({
                        path: fullPath,
                        size: stats.size
                    });
                }
            } catch (err) {
                errors.push({
                    path: fullPath,
                    error: err.code === 'EACCES' ? '权限不足' : err.message
                });
            }
        }
    } catch (err) {
        errors.push({
            path: dirPath,
            error: err.code === 'EACCES' ? '权限不足' : err.message
        });
    }
    
    return { files: arrayOfFiles, errors };
}

async function calculateFolderHash(folderPath) {
    const { files, errors } = getAllFiles(folderPath);
    
    if (errors.length > 0) {
        console.log(`\n[!] 警告: 以下文件/目录访问失败:`);
        for (const err of errors) {
            console.log(`  - ${err.path}: ${err.error}`);
        }
    }
    
    if (files.length === 0) {
        return { hash: null, fileCount: 0, totalSize: 0, errors, fileMap: new Map() };
    }
    
    files.sort((a, b) => a.path.localeCompare(b.path));
    
    const combinedHash = crypto.createHash('sha256');
    let totalSize = 0;
    let processedCount = 0;
    const fileMap = new Map();
    
    console.log(`\n正在计算文件夹哈希值...`);
    console.log(`  文件夹路径: ${folderPath}`);
    console.log(`  文件总数: ${files.length}`);
    
    for (const fileInfo of files) {
        processedCount++;
        totalSize += fileInfo.size;
        
        if (files.length > 10) {
            const progress = Math.floor((processedCount / files.length) * 100);
            if (processedCount % Math.max(1, Math.floor(files.length / 10)) === 0) {
                console.log(`  处理进度: ${processedCount}/${files.length} (${progress}%)`);
            }
        }
        
        try {
            const fileHash = await calculateSHA256(fileInfo.path);
            combinedHash.update(fileInfo.path + ':' + fileHash + '\n');
            const relativePath = path.relative(folderPath, fileInfo.path);
            fileMap.set(relativePath, { hash: fileHash, size: fileInfo.size });
        } catch (err) {
            errors.push({
                path: fileInfo.path,
                error: err.message
            });
        }
    }
    
    const folderHash = combinedHash.digest('hex');
    
    return { hash: folderHash, fileCount: files.length, totalSize, errors, fileMap };
}

function printUsage() {
    console.log('\n使用方法:');
    console.log('  模式一: node hash-script.js <文件/文件夹路径>');
    console.log('  模式二: node hash-script.js --compare <文件夹1> <文件夹2>');
    console.log('\n参数说明:');
    console.log('  --compare, -c2    双路径对比模式');
    console.log('  --verify, -v      强制验证模式');
    console.log('  --compute, -c     强制计算模式');
    console.log('\n多文件支持:');
    console.log('  使用 | 分隔多个路径');
    console.log('  示例: node hash-script.js "file1.txt|file2.txt"');
    console.log('\n自动模式:');
    console.log('  - 首次运行: 计算并记录哈希值');
    console.log('  - 再次运行: 验证文件完整性');
}

async function computeFileMode(filePath) {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
        console.error(`[X] 错误: 文件不存在 - ${absolutePath}`);
        process.exit(1);
    }
    
    try {
        fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (err) {
        console.error(`[X] 错误: 权限不足 - ${absolutePath}`);
        process.exit(1);
    }
    
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
        console.error(`[X] 错误: 不是文件 - ${absolutePath}`);
        process.exit(1);
    }
    
    console.log(`\n正在计算文件哈希值...`);
    console.log(`  文件路径: ${absolutePath}`);
    console.log(`  文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    try {
        const hashValue = await calculateSHA256(absolutePath);
        const fileName = path.basename(absolutePath);
        const timestamp = formatTimestamp();
        
        ensureRecordsDirectory();
        appendFileRecord(absolutePath, fileName, timestamp, hashValue);
        
        console.log(`\n[OK] 哈希计算完成`);
        console.log(`  文件名: ${fileName}`);
        console.log(`  时间戳: ${timestamp}`);
        console.log(`  SHA256: ${hashValue}`);
        console.log(`\n[+] 记录已保存到: ${FILE_LOG_PATH}`);
        
    } catch (err) {
        console.error(`[X] 错误: 文件读取失败 - ${err.message}`);
        process.exit(1);
    }
}

async function computeFolderMode(folderPath) {
    const absolutePath = path.resolve(folderPath);
    
    if (!fs.existsSync(absolutePath)) {
        console.error(`[X] 错误: 文件夹不存在 - ${absolutePath}`);
        process.exit(1);
    }
    
    try {
        fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (err) {
        console.error(`[X] 错误: 权限不足 - ${absolutePath}`);
        process.exit(1);
    }
    
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
        console.error(`[X] 错误: 不是文件夹 - ${absolutePath}`);
        process.exit(1);
    }
    
    try {
        const result = await calculateFolderHash(absolutePath);
        
        if (result.fileCount === 0) {
            console.log(`\n[!] 警告: 文件夹为空或所有文件都无法访问`);
            process.exit(0);
        }
        
        const folderName = path.basename(absolutePath);
        const timestamp = formatTimestamp();
        
        ensureRecordsDirectory();
        appendFolderRecord(absolutePath, folderName, timestamp, result.hash, result.fileCount);
        
        console.log(`\n[OK] 文件夹哈希计算完成`);
        console.log(`  文件夹名: ${folderName}`);
        console.log(`  文件数量: ${result.fileCount}`);
        console.log(`  总大小: ${(result.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  时间戳: ${timestamp}`);
        console.log(`  SHA256: ${result.hash}`);
        console.log(`\n[+] 记录已保存到: ${FOLDER_LOG_PATH}`);
        
    } catch (err) {
        console.error(`[X] 错误: 文件夹处理失败 - ${err.message}`);
        process.exit(1);
    }
}

async function verifyFileMode(filePath) {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
        console.error(`[X] 错误: 文件不存在 - ${absolutePath}`);
        process.exit(1);
    }
    
    try {
        fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (err) {
        console.error(`[X] 错误: 权限不足 - ${absolutePath}`);
        process.exit(1);
    }
    
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
        console.error(`[X] 错误: 不是文件 - ${absolutePath}`);
        process.exit(1);
    }
    
    const record = findFileRecord(absolutePath);
    
    if (!record) {
        console.log(`\n[!] 验证结果: 文件不存在于记录中`);
        console.log(`  文件路径: ${absolutePath}`);
        console.log(`  提示: 请先计算哈希值记录此文件`);
        process.exit(0);
    }
    
    console.log(`\n正在验证文件完整性...`);
    console.log(`  文件路径: ${absolutePath}`);
    console.log(`  对比记录: ${record.time} (最新记录)`);
    
    try {
        const currentHash = await calculateSHA256(absolutePath);
        
        if (currentHash === record.hash) {
            console.log(`\n[OK] 验证结果: 文件未被篡改`);
            console.log(`  哈希值: ${currentHash}`);
            console.log(`  文件完整性验证通过，哈希值匹配`);
        } else {
            console.log(`\n[X] 验证结果: 文件已被篡改`);
            console.log(`\n  ========== 哈希值对比 ==========`);
            console.log(`  原始哈希: ${record.hash}`);
            console.log(`  当前哈希: ${currentHash}`);
            console.log(`  =================================`);
            console.log(`\n  警告: 当前文件哈希值与记录不匹配！`);
        }
        
    } catch (err) {
        console.error(`[X] 错误: 文件读取失败 - ${err.message}`);
        process.exit(1);
    }
}

async function verifyFolderMode(folderPath) {
    const absolutePath = path.resolve(folderPath);
    
    if (!fs.existsSync(absolutePath)) {
        console.error(`[X] 错误: 文件夹不存在 - ${absolutePath}`);
        process.exit(1);
    }
    
    try {
        fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (err) {
        console.error(`[X] 错误: 权限不足 - ${absolutePath}`);
        process.exit(1);
    }
    
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
        console.error(`[X] 错误: 不是文件夹 - ${absolutePath}`);
        process.exit(1);
    }
    
    const record = findFolderRecord(absolutePath);
    
    if (!record) {
        console.log(`\n[!] 验证结果: 文件夹不存在于记录中`);
        console.log(`  文件夹路径: ${absolutePath}`);
        console.log(`  提示: 请先计算哈希值记录此文件夹`);
        process.exit(0);
    }
    
    console.log(`\n正在验证文件夹完整性...`);
    console.log(`  文件夹路径: ${absolutePath}`);
    console.log(`  对比记录: ${record.time} (最新记录)`);
    console.log(`  记录文件数: ${record.fileCount}`);
    
    try {
        const result = await calculateFolderHash(absolutePath);
        
        if (result.hash === record.hash && result.fileCount === record.fileCount) {
            console.log(`\n[OK] 验证结果: 文件夹未被篡改`);
            console.log(`  文件数量: ${result.fileCount}`);
            console.log(`  哈希值: ${result.hash}`);
            console.log(`  文件夹完整性验证通过，哈希值匹配`);
        } else {
            console.log(`\n[X] 验证结果: 文件夹已被篡改或修改`);
            console.log(`\n  ========== 对比结果 ==========`);
            
            if (result.fileCount !== record.fileCount) {
                console.log(`  文件数量:`);
                console.log(`    原始: ${record.fileCount}`);
                console.log(`    当前: ${result.fileCount}`);
            }
            
            if (result.hash !== record.hash) {
                console.log(`  哈希值:`);
                console.log(`    原始: ${record.hash}`);
                console.log(`    当前: ${result.hash}`);
            }
            console.log(`  =================================`);
            console.log(`\n  警告: 文件夹内容已发生变化！`);
        }
        
    } catch (err) {
        console.error(`[X] 错误: 文件夹处理失败 - ${err.message}`);
        process.exit(1);
    }
}

async function processTarget(targetPath, forceVerify, forceCompute) {
    const absolutePath = path.resolve(targetPath);
    
    if (!fs.existsSync(absolutePath)) {
        console.error(`[X] 错误: 路径不存在 - ${absolutePath}`);
        return false;
    }
    
    const stats = fs.statSync(absolutePath);
    const isDirectory = stats.isDirectory();
    
    let shouldVerify = forceVerify;
    
    if (!forceVerify && !forceCompute) {
        if (isDirectory) {
            shouldVerify = findFolderRecord(absolutePath) !== null;
        } else {
            shouldVerify = findFileRecord(absolutePath) !== null;
        }
    }
    
    if (shouldVerify && !forceCompute) {
        if (isDirectory) {
            await verifyFolderMode(targetPath);
        } else {
            await verifyFileMode(targetPath);
        }
    } else {
        if (isDirectory) {
            await computeFolderMode(targetPath);
        } else {
            await computeFileMode(targetPath);
        }
    }
    
    return true;
}

async function compareTwoFolders(folder1, folder2) {
    const absolutePath1 = path.resolve(folder1);
    const absolutePath2 = path.resolve(folder2);
    
    console.log(`\n========================================`);
    console.log(`        双路径文件夹对比模式`);
    console.log(`========================================`);
    console.log(`\n文件夹1: ${absolutePath1}`);
    console.log(`文件夹2: ${absolutePath2}`);
    
    if (!fs.existsSync(absolutePath1)) {
        console.error(`\n[X] 错误: 文件夹1不存在 - ${absolutePath1}`);
        process.exit(1);
    }
    
    if (!fs.existsSync(absolutePath2)) {
        console.error(`\n[X] 错误: 文件夹2不存在 - ${absolutePath2}`);
        process.exit(1);
    }
    
    const stats1 = fs.statSync(absolutePath1);
    const stats2 = fs.statSync(absolutePath2);
    
    if (!stats1.isDirectory()) {
        console.error(`\n[X] 错误: 路径1不是文件夹 - ${absolutePath1}`);
        process.exit(1);
    }
    
    if (!stats2.isDirectory()) {
        console.error(`\n[X] 错误: 路径2不是文件夹 - ${absolutePath2}`);
        process.exit(1);
    }
    
    console.log(`\n正在扫描文件夹1...`);
    const result1 = await calculateFolderHash(absolutePath1);
    
    console.log(`\n正在扫描文件夹2...`);
    const result2 = await calculateFolderHash(absolutePath2);
    
    const map1 = result1.fileMap;
    const map2 = result2.fileMap;
    
    const added = [];
    const deleted = [];
    const modified = [];
    const unchanged = [];
    
    for (const [relPath, info1] of map1) {
        if (map2.has(relPath)) {
            const info2 = map2.get(relPath);
            if (info1.hash === info2.hash) {
                unchanged.push({ path: relPath, hash: info1.hash });
            } else {
                modified.push({ 
                    path: relPath, 
                    hash1: info1.hash, 
                    hash2: info2.hash,
                    size1: info1.size,
                    size2: info2.size
                });
            }
        } else {
            deleted.push({ path: relPath, hash: info1.hash });
        }
    }
    
    for (const [relPath, info2] of map2) {
        if (!map1.has(relPath)) {
            added.push({ path: relPath, hash: info2.hash });
        }
    }
    
    console.log(`\n========================================`);
    console.log(`           对比结果报告`);
    console.log(`========================================`);
    
    console.log(`\n[统计信息]`);
    console.log(`  文件夹1文件数: ${result1.fileCount}`);
    console.log(`  文件夹2文件数: ${result2.fileCount}`);
    console.log(`  未变化文件: ${unchanged.length}`);
    console.log(`  新增文件: ${added.length}`);
    console.log(`  删除文件: ${deleted.length}`);
    console.log(`  修改文件: ${modified.length}`);
    
    if (added.length > 0) {
        console.log(`\n[+] 新增文件 (${added.length}个):`);
        for (const file of added) {
            console.log(`    + ${file.path}`);
            console.log(`        文件夹2哈希: ${file.hash}`);
        }
    }
    
    if (deleted.length > 0) {
        console.log(`\n[-] 删除文件 (${deleted.length}个):`);
        for (const file of deleted) {
            console.log(`    - ${file.path}`);
            console.log(`        文件夹1哈希: ${file.hash}`);
        }
    }
    
    if (modified.length > 0) {
        console.log(`\n[*] 修改文件 (${modified.length}个):`);
        for (const file of modified) {
            console.log(`    * ${file.path}`);
            console.log(`        文件夹1哈希: ${file.hash1}`);
            console.log(`        文件夹2哈希: ${file.hash2}`);
        }
    }
    
    if (unchanged.length > 0 && unchanged.length <= 10) {
        console.log(`\n[=] 未变化文件 (${unchanged.length}个):`);
        for (const file of unchanged) {
            console.log(`    = ${file.path}`);
        }
    } else if (unchanged.length > 10) {
        console.log(`\n[=] 未变化文件: ${unchanged.length}个 (数量较多，不逐一显示)`);
    }
    
    const hasChanges = added.length > 0 || deleted.length > 0 || modified.length > 0;
    
    console.log(`\n========================================`);
    if (!hasChanges) {
        console.log(`[OK] 结论: 两个文件夹内容完全相同`);
    } else {
        console.log(`[!] 结论: 两个文件夹存在差异`);
    }
    console.log(`========================================`);
    
    return hasChanges;
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('[X] 错误: 缺少参数');
        printUsage();
        process.exit(1);
    }
    
    if (args[0] === '--compare' || args[0] === '-c2') {
        if (args.length < 3) {
            console.error('[X] 错误: 双路径对比模式需要指定两个文件夹路径');
            console.log('用法: node hash-script.js --compare <文件夹1> <文件夹2>');
            process.exit(1);
        }
        await compareTwoFolders(args[1], args[2]);
        return;
    }
    
    const targetPaths = [];
    let forceVerify = false;
    let forceCompute = false;
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-v' || arg === '--verify') {
            forceVerify = true;
        } else if (arg === '-c' || arg === '--compute') {
            forceCompute = true;
        } else if (!arg.startsWith('-')) {
            const paths = arg.split('|').filter(p => p.trim());
            targetPaths.push(...paths.map(p => p.trim()));
        }
    }
    
    if (targetPaths.length === 0) {
        console.error('[X] 错误: 未指定文件或文件夹路径');
        printUsage();
        process.exit(1);
    }
    
    console.log(`\n正在处理 ${targetPaths.length} 个项目...\n`);
    
    let successCount = 0;
    for (let i = 0; i < targetPaths.length; i++) {
        console.log(`[${i + 1}/${targetPaths.length}] ${targetPaths[i]}`);
        const success = await processTarget(targetPaths[i], forceVerify, forceCompute);
        if (success) successCount++;
        console.log('');
    }
    
    console.log(`完成: ${successCount}/${targetPaths.length} 个项目处理成功`);
}

main().catch((err) => {
    console.error(`[X] 未预期的错误: ${err.message}`);
    process.exit(1);
});
