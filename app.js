// 全局变量
let fetchedMedia = [];
const tweetLinkRegex = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i;

// DOM 元素
const elements = {
    tweetLinks: document.getElementById('tweet-links'),
    fetchButton: document.getElementById('fetch-button'),
    clearButton: document.getElementById('clear-button'),
    formatPattern: document.getElementById('format-pattern'),
    resultsContainer: document.getElementById('results-container'),
    resultCount: document.getElementById('result-count'),
    downloadAllButton: document.getElementById('download-all'),
    loadingOverlay: document.getElementById('loading-overlay'),
    mediaItemTemplate: document.getElementById('media-item-template')
};

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    elements.fetchButton.addEventListener('click', handleFetchButtonClick);
    elements.clearButton.addEventListener('click', handleClearButtonClick);
    elements.downloadAllButton.addEventListener('click', handleDownloadAllClick);
    
    // 全选/取消全选复选框事件
    document.getElementById('select-all').addEventListener('change', function() {
        const isChecked = this.checked;
        document.querySelectorAll('.media-select').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });
});

// 处理抓取按钮点击
async function handleFetchButtonClick() {
    const links = elements.tweetLinks.value.trim().split('\n').filter(link => link.trim() !== '');
    
    if (links.length === 0) {
        showNotification('请输入至少一个Twitter链接', 'warning');
        return;
    }
    
    // 显示加载提示
    showLoading(true);
    
    try {
        // 清空之前的结果
        fetchedMedia = [];
        updateResultsUI();
        
        // 处理每个链接
        for (const link of links) {
            if (tweetLinkRegex.test(link)) {
                await fetchTweetMedia(link.trim());
            } else {
                console.warn('无效的Twitter链接:', link);
            }
        }
        
        // 更新UI
        updateResultsUI();
        elements.downloadAllButton.disabled = fetchedMedia.length === 0;
        
        // 显示结果统计
        showNotification(`成功抓取 ${fetchedMedia.length} 个媒体文件`, 'success');
    } catch (error) {
        console.error('抓取过程中出错:', error);
        showNotification('抓取过程中出错: ' + error.message, 'error');
    } finally {
        // 隐藏加载提示
        showLoading(false);
    }
}

// 处理清空按钮点击
function handleClearButtonClick() {
    elements.tweetLinks.value = '';
    fetchedMedia = [];
    updateResultsUI();
    elements.downloadAllButton.disabled = true;
}

// 处理下载选中项按钮点击
async function handleDownloadAllClick() {
    if (fetchedMedia.length === 0) return;
    
    // 获取所有选中的媒体项索引
    const selectedIndices = [];
    document.querySelectorAll('.media-select').forEach((checkbox, index) => {
        if (checkbox.checked) {
            selectedIndices.push(index);
        }
    });
    
    if (selectedIndices.length === 0) {
        showNotification('请至少选择一个媒体项', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const zip = new JSZip();
        const formatPattern = elements.formatPattern.value || '{name}_{time}_@{id}';
        
        // 添加选中的媒体文件到zip
        for (const index of selectedIndices) {
            const media = fetchedMedia[index];
            const fileName = formatFileName(formatPattern, media) + getFileExtension(media.url);
            
            // 获取媒体文件的二进制数据
            const response = await fetch(media.url);
            const blob = await response.blob();
            
            // 添加到zip
            zip.file(fileName, blob);
        }
        
        // 生成并下载zip文件
        const zipBlob = await zip.generateAsync({type: 'blob'});
        try {
            saveAs(zipBlob, `twitter_media_${new Date().toISOString().slice(0, 10)}.zip`);
            showNotification(`已打包下载 ${selectedIndices.length} 个媒体文件`, 'success');
        } catch (e) {
            console.warn('FileSaver.js 打包下载失败，尝试使用 fallback 方案:', e);
            // Fallback: 创建一个临时的 Blob URL 并使用 <a> 标签下载
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `twitter_media_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // 释放URL对象
            showNotification(`已尝试打包下载 ${selectedIndices.length} 个媒体文件，请检查浏览器下载`, 'info');
        }
    } catch (error) {
        console.error('打包下载过程中出错:', error);
        showNotification('打包下载过程中出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 抓取推文媒体
async function fetchTweetMedia(tweetUrl) {
    try {
        // 从URL中提取推文ID
        const match = tweetUrl.match(tweetLinkRegex);
        if (!match) throw new Error('无效的Twitter链接');
        
        const username = match[1];
        const tweetId = match[2];
        
        // 使用Twitter API代理服务获取推文数据
        // 注意：这里使用的是一个公共API代理，实际应用中可能需要自己的API密钥或其他方案
        const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`API请求失败: ${response.status}`);
        
        const data = await response.json();
        
        // 检查API响应
        if (!data.tweet) throw new Error('无法获取推文数据');
        
        const tweet = data.tweet;
        const author = tweet.author || {};
        
        // 处理媒体文件
        if (tweet.media && tweet.media.videos && tweet.media.videos.length > 0) {
            // 处理视频
            for (const video of tweet.media.videos) {
                // 获取最高质量的视频URL
                const videoUrl = video.url;
                
                // 创建媒体对象
                const mediaObj = {
                    type: 'video',
                    url: videoUrl,
                    previewUrl: video.thumbnail_url || tweet.media.photos?.[0]?.url,
                    authorName: author.name || username,
                    authorId: author.screen_name || username,
                    authorAvatar: author.avatar_url || '',
                    text: tweet.text || '',
                    time: tweet.created_at || new Date().toISOString(),
                    link: tweetUrl,
                    id: tweetId
                };
                
                fetchedMedia.push(mediaObj);
            }
        } else if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
            // 处理图片
            for (const photo of tweet.media.photos) {
                const mediaObj = {
                    type: 'image',
                    url: photo.url,
                    previewUrl: photo.url,
                    authorName: author.name || username,
                    authorId: author.screen_name || username,
                    authorAvatar: author.avatar_url || '',
                    text: tweet.text || '',
                    time: tweet.created_at || new Date().toISOString(),
                    link: tweetUrl,
                    id: tweetId
                };
                
                fetchedMedia.push(mediaObj);
            }
        } else {
            console.warn('推文中没有媒体内容:', tweetUrl);
        }
    } catch (error) {
        console.error('抓取推文媒体时出错:', error, tweetUrl);
        throw error;
    }
}

// 更新结果UI
function updateResultsUI() {
    // 清空结果容器
    elements.resultsContainer.innerHTML = '';
    elements.resultCount.textContent = `(${fetchedMedia.length})`;
    
    if (fetchedMedia.length === 0) {
        // 显示空状态
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <i class="fas fa-cloud-download-alt"></i>
            <p>输入链接并点击"开始抓取"按钮</p>
        `;
        elements.resultsContainer.appendChild(emptyState);
        return;
    }
    
    // 为每个媒体创建UI元素
    fetchedMedia.forEach((media, index) => {
        const mediaElement = createMediaElement(media, index);
        elements.resultsContainer.appendChild(mediaElement);
    });
}

// 创建媒体元素
function createMediaElement(media, index) {
    const template = elements.mediaItemTemplate.content.cloneNode(true);
    const mediaItem = template.querySelector('.media-item');
    
    // 设置复选框
    const checkbox = mediaItem.querySelector('.media-select');
    checkbox.id = `media-select-${index}`;
    checkbox.dataset.index = index;
    
    // 设置预览
    const previewContainer = mediaItem.querySelector('.media-preview');
    if (media.type === 'video') {
        // 视频预览使用缩略图
        const img = document.createElement('img');
        img.src = media.previewUrl;
        img.alt = '视频预览';
        previewContainer.appendChild(img);
        
        // 添加视频图标
        const videoIcon = document.createElement('div');
        videoIcon.className = 'video-icon';
        videoIcon.innerHTML = '<i class="fas fa-play-circle"></i>';
        previewContainer.appendChild(videoIcon);
    } else {
        // 图片预览
        const img = document.createElement('img');
        img.src = media.previewUrl;
        img.alt = '图片预览';
        previewContainer.appendChild(img);
    }
    
    // 设置作者信息
    mediaItem.querySelector('.author-avatar').src = media.authorAvatar || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
    mediaItem.querySelector('.author-name').textContent = media.authorName;
    mediaItem.querySelector('.author-id').textContent = '@' + media.authorId;
    
    // 设置推文文本
    mediaItem.querySelector('.media-text').textContent = media.text;
    
    // 设置元数据
    const timeElement = mediaItem.querySelector('.media-time');
    timeElement.textContent = formatDate(media.time);
    timeElement.title = new Date(media.time).toLocaleString();
    
    mediaItem.querySelector('.media-type').textContent = media.type === 'video' ? '视频' : '图片';
    
    // 设置操作按钮
    const downloadButton = mediaItem.querySelector('.download-button');
    downloadButton.addEventListener('click', () => downloadMedia(media));
    
    const viewOriginalLink = mediaItem.querySelector('.view-original');
    viewOriginalLink.href = media.link;
    
    return mediaItem;
}

// 下载单个媒体文件
async function downloadMedia(media) {
    try {
        showLoading(true);
        
        const formatPattern = elements.formatPattern.value || '{name}_{time}_@{id}';
        const fileName = formatFileName(formatPattern, media) + getFileExtension(media.url);
        
        const response = await fetch(media.url);
        const blob = await response.blob();
        
        try {
            saveAs(blob, fileName);
            showNotification('媒体文件已下载', 'success');
        } catch (e) {
            console.warn('FileSaver.js 下载失败，尝试使用 fallback 方案:', e);
            // Fallback: 使用 <a> 标签的 download 属性
            const a = document.createElement('a');
            a.href = media.url;
            a.download = fileName; // 设置文件名
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification('媒体文件已尝试下载，请检查浏览器下载', 'info');
        }
    } catch (error) {
        console.error('下载媒体文件时出错:', error);
        showNotification('下载媒体文件时出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 格式化文件名
function formatFileName(pattern, media) {
    let result = pattern;
    
    // 处理正则表达式匹配格式 {"输出格式":r/正则表达式/, 变量名}
    // 处理正则表达式匹配格式 {"输出格式":r/正则表达式/, 变量名}
    // 确保正则表达式部分在处理字符范围之前执行，因为正则表达式可能生成需要进一步截取的内容
    result = result.replace(/\{"([^\"]+)":r\/([^\/]+)\/,\s*([^}]+)\}/g, (match, outputFormat, regexStr, varName) => {
        try {
            const regex = new RegExp(regexStr, 'u'); // 添加 'u' 标志以支持 Unicode 字符
            let value = '';
            
            switch (varName.trim()) {
                case 'id': value = media.authorId || ''; break;
                case 'name': value = media.authorName || ''; break;
                case 'context': value = media.text || ''; break;
                case 'time': value = media.time || ''; break;
                case 'link': value = media.link || ''; break;
                default: value = '';
            }
            
            const regexMatch = value.match(regex);
            if (regexMatch && regexMatch.length > 0) {
                // 替换输出格式中的 $1, $2 等为匹配组
                // 替换输出格式中的 $1, $2 等为匹配组，确保 $0 对应整个匹配
                return outputFormat.replace(/\$(\d+)/g, (placeholder, groupNumStr) => {
                    const groupNum = parseInt(groupNumStr);
                    return regexMatch[groupNum] || '';
                });

            }
            return '';
        } catch (e) {
            console.error('正则表达式错误:', e);
            return '';
        }
    });
    
    // 处理自定义时间格式 {time:"格式"}
    // 处理自定义时间格式 {time:"格式"}
    result = result.replace(/\{time:"([^"]+)"\}/g, (match, timeFormat) => {
        return formatCustomDate(media.time, timeFormat);
    });
    
    // 处理字符范围格式 {变量名}[起始:结束] 或 变量名[:结束]
    result = result.replace(/\{([^}]+)\}\[(\d*):(\d*)\]|([^\{\}\[\]]+)\[(\d*):(\d*)\]/g, (match, key1, start1, end1, key2, start2, end2) => {
        const key = key1 || key2;
        const start = start1 || start2;
        const end = end1 || end2;
        
        let value = '';
        switch (key) {
            case 'id': value = media.authorId || ''; break;
            case 'name': value = media.authorName || ''; break;
            case 'context': value = media.text || ''; break;
            case 'time': value = formatDate(media.time) || ''; break;
            case 'link': value = media.link || ''; break;
            default: value = '';
        }
        
        const startIdx = start === '' ? 0 : parseInt(start);
        const endIdx = end === '' ? value.length : parseInt(end);
        return value.substring(startIdx, endIdx);
    });
    
    // 处理普通变量 {变量名}
    result = result
        .replace(/\{id\}/g, media.authorId || 'unknown')
        .replace(/\{name\}/g, media.authorName || 'unknown')
        .replace(/\{context\}/g, (media.text || '').substring(0, 30).replace(/[\/:*?"<>|]/g, '_'))
        .replace(/\{time\}/g, formatDate(media.time) || 'unknown')
        .replace(/\{link\}/g, media.link || 'unknown');
    
    // 移除Windows文件名中不允许的字符
    return result.replace(/[\/:*?"<>|]/g, '_');
}

// 获取文件扩展名
function getFileExtension(url) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.substring(pathname.lastIndexOf('.'));
    
    // 如果URL没有扩展名，根据媒体类型返回默认扩展名
    if (!extension || extension.length > 5) {
        if (url.includes('video')) return '.mp4';
        return '.jpg';
    }
    
    return extension;
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

// 自定义格式化日期
function formatCustomDate(dateString, format) {
    const date = new Date(dateString);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return format
        .replace(/yyyy/g, year)
        .replace(/yy/g, String(year).slice(-2))
        .replace(/mm/g, month)
        .replace(/dd/g, day)
        .replace(/hh/g, hour)
        .replace(/MM/g, minute)
        .replace(/ss/g, second);
}

// 显示/隐藏加载提示
function showLoading(show) {
    elements.loadingOverlay.classList.toggle('hidden', !show);
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 添加样式
    Object.assign(notification.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '4px',
        color: 'white',
        zIndex: '1000',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
        transition: 'all 0.3s ease',
        opacity: '0',
        transform: 'translateY(20px)'
    });
    
    // 根据类型设置背景色
    const colors = {
        success: '#17bf63',
        error: '#e0245e',
        warning: '#ffad1f',
        info: '#1da1f2'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    
    // 显示通知
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // 3秒后隐藏通知
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        
        // 动画结束后移除元素
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 添加CSS样式
const style = document.createElement('style');
style.textContent = `
.video-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 3rem;
    text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    opacity: 0.8;
}

.notification {
    animation: fadeInUp 0.3s ease forwards;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
`;
document.head.appendChild(style);