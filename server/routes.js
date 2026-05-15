const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports = (io) => {
    const configPath = path.join(__dirname, '../config.json');
    const commandFile = path.join(__dirname, '../yt-dlpcommands.txt');

    const getConfig = async () => {
        return await fs.readJson(configPath);
    };

    router.get('/config', async (req, res) => {
        try {
            const config = await getConfig();
            res.json(config);
        } catch (error) {
            res.status(500).json({ error: 'Failed to read config' });
        }
    });

    router.get('/media/search', async (req, res) => {
        const { term, service } = req.query;
        try {
            const config = await getConfig();
            const settings = config[service];
            const endpoint = service === 'Sonarr' ? 'series' : 'movie';
            
            const response = await axios.get(`${settings.BaseUrl}/${endpoint}/lookup`, {
                params: { term },
                headers: { 'X-Api-Key': settings.ApiKey }
            });
            res.json(response.data);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Search failed' });
        }
    });

    router.get('/media/library', async (req, res) => {
        const { service } = req.query;
        try {
            const config = await getConfig();
            const settings = config[service];
            const endpoint = service === 'Sonarr' ? 'series' : 'movie';
            
            const response = await axios.get(`${settings.BaseUrl}/${endpoint}`, {
                headers: { 'X-Api-Key': settings.ApiKey }
            });
            res.json(response.data);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to fetch library' });
        }
    });

    router.get('/media/poster', async (req, res) => {
        const { url } = req.query;
        if (!url) return res.status(400).send('No URL provided');
        
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            });
            response.data.pipe(res);
        } catch (error) {
            res.status(404).send('Poster not found');
        }
    });

    router.post('/media/add', async (req, res) => {
        const { service, item } = req.body;
        try {
            const config = await getConfig();
            const settings = config[service];
            const endpoint = service === 'Sonarr' ? 'series' : 'movie';

            const addBody = {
                title: item.title,
                qualityProfileId: settings.QualityProfileId,
                rootFolderPath: settings.RootPath,
                monitored: true,
                addOptions: { searchForMissingEpisodes: false }
            };

            if (service === 'Radarr') {
                addBody.tmdbId = item.tmdbId;
                addBody.year = item.year;
            } else {
                addBody.tvdbId = item.tvdbId;
            }

            const response = await axios.post(`${settings.BaseUrl}/${endpoint}`, addBody, {
                headers: { 'X-Api-Key': settings.ApiKey }
            });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({ error: 'Failed to add media' });
        }
    });

    router.post('/media/scan', async (req, res) => {
        const { service } = req.body;
        try {
            const config = await getConfig();
            const settings = config[service];
            const command = service === 'Sonarr' ? 'RescanSeries' : 'RescanMovie';

            const response = await axios.post(`${settings.BaseUrl}/command`, { name: command }, {
                headers: { 'X-Api-Key': settings.ApiKey }
            });
            res.json({ success: true, message: `${service} scan triggered.` });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: `Failed to trigger ${service} scan.` });
        }
    });

    router.get('/queue', async (req, res) => {
        try {
            if (!(await fs.pathExists(commandFile))) {
                return res.json([]);
            }
            const content = await fs.readFile(commandFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            const queue = lines.map(line => JSON.parse(line));
            res.json(queue);
        } catch (error) {
            res.status(500).json({ error: 'Failed to read queue' });
        }
    });

    router.post('/queue/clear', async (req, res) => {
        try {
            await fs.writeFile(commandFile, '');
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to clear queue' });
        }
    });

    router.post('/bridge/scrape', async (req, res) => {
        const { items, isMovie, season, epStart, epEnd, service } = req.body;
        
        res.json({ message: 'Scraping started' });

        const config = await getConfig();
        const settings = config[service];
        const endpoint = service === 'Sonarr' ? 'series' : 'movie';

        for (const item of items) {
            // 1. SMART CHECK: Is it in the library?
            let libraryItem = null;
            try {
                const libResponse = await axios.get(`${settings.BaseUrl}/${endpoint}`, {
                    headers: { 'X-Api-Key': settings.ApiKey }
                });
                
                const idKey = isMovie ? 'tmdbId' : 'tvdbId';
                libraryItem = libResponse.data.find(i => i[idKey] === item[idKey]);

                if (!libraryItem) {
                    io.emit('log', `Auto-adding ${item.title} to ${service} library...`);
                    const addBody = {
                        title: item.title,
                        qualityProfileId: settings.QualityProfileId,
                        rootFolderPath: settings.RootPath,
                        monitored: true,
                        addOptions: { searchForMissingEpisodes: false }
                    };
                    if (isMovie) {
                        addBody.tmdbId = item.tmdbId;
                        addBody.year = item.year;
                    } else {
                        addBody.tvdbId = item.tvdbId;
                    }

                    const addRes = await axios.post(`${settings.BaseUrl}/${endpoint}`, addBody, {
                        headers: { 'X-Api-Key': settings.ApiKey }
                    });
                    libraryItem = addRes.data;
                    io.emit('log', `SUCCESS: Added ${item.title} to library.`);
                }
            } catch (error) {
                io.emit('log', `Library Check/Add Warning: ${error.message}`);
            }

            const urls = [];
            const id = item.imdbId || item.tmdbId || item.tvdbId;

            if (isMovie) {
                urls.push(`https://vidcore.net/movie/${id}`);
            } else {
                for (let e = parseInt(epStart); e <= parseInt(epEnd); e++) {
                    urls.push(`https://vidcore.net/tv/${id}/${season}/${e}`);
                }
            }

            for (const url of urls) {
                io.emit('log', `Sniffing: ${url}`);
                
                const child = spawn('node', ['omni-bridge.js', url], {
                    cwd: path.join(__dirname, '..')
                });

                child.stdout.on('data', async (data) => {
                    const output = data.toString().trim();
                    try {
                        const json = JSON.parse(output);
                        if (json.success) {
                            io.emit('log', `SUCCESS: Found stream for ${url}`);
                            const metadata = {
                                streamUrl: json.streamUrl,
                                originalUrl: json.originalUrl,
                                title: item.title,
                                year: item.year,
                                isMovie: isMovie,
                                season: isMovie ? "" : season.toString().padStart(2, '0')
                            };
                            await fs.appendFile(commandFile, JSON.stringify(metadata) + '\n');
                            io.emit('queueUpdated');
                        } else {
                            io.emit('log', `FAILED: ${url}`);
                        }
                    } catch (e) {
                        // Not JSON output, maybe progress log
                        if (output) io.emit('log', output);
                    }
                });

                child.stderr.on('data', (data) => {
                    io.emit('log', `ERROR: ${data.toString()}`);
                });

                await new Promise(resolve => child.on('close', resolve));
            }
        }
    });

    router.post('/ingest/start', async (req, res) => {
        const { concurrent = 3 } = req.body || {};
        console.log(`Ingest requested. Concurrent: ${concurrent}`);
        
        try {
            if (!(await fs.pathExists(commandFile))) {
                console.log(`Command file not found: ${commandFile}`);
                return res.status(400).json({ error: 'Queue file not found' });
            }
            const content = await fs.readFile(commandFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            console.log(`Found ${lines.length} lines in command file.`);

            if (lines.length === 0) {
                return res.status(400).json({ error: 'Queue is empty' });
            }

            res.json({ message: 'Ingestion started' });
            io.emit('log', `Starting ingestion of ${lines.length} items...`);

            const config = await getConfig();
            const downloadPath = config.General.DownloadTempPath;
            console.log(`Target download path: ${downloadPath}`);

            const runDownload = async (line) => {
                const metadata = JSON.parse(line);
                const safeTitle = metadata.title.replace(/[\\\/\:\*\?\"<>\|]/g, '');
                const folderName = metadata.isMovie ? `${safeTitle} (${metadata.year})` : safeTitle;
                const targetFolder = path.join(downloadPath, folderName);

                await fs.ensureDir(targetFolder);

                let ep = "01";
                let season = metadata.season;

                const epMatch = metadata.originalUrl.match(/\/tv\/[^/]+\/[^/]+\/(\d+)/);
                if (epMatch) {
                    ep = epMatch[1].padStart(2, '0');
                    const sMatch = metadata.originalUrl.match(/\/tv\/[^/]+\/(\d+)\//);
                    if (sMatch) season = sMatch[1].padStart(2, '0');
                }

                const fileName = metadata.isMovie ? `${safeTitle} (${metadata.year})` : `${safeTitle}_S${season}E${ep}`;

                io.emit('log', `Downloading: ${fileName}`);

                const args = [
                    metadata.streamUrl,
                    "-H", "Referer: https://vidcore.net/",
                    "-H", "User-Agent: Mozilla/5.0",
                    "--save-dir", targetFolder,
                    "--save-name", fileName,
                    "--auto-select",
                    "--binary-merge",
                    "--del-after-done", "true",
                    "--thread-count", "16"
                ];

                const child = spawn(path.join(__dirname, '../N_m3u8DL-RE.exe'), args, {
                    cwd: path.join(__dirname, '..')
                });

                io.emit('downloadStarted', { fileName });

                child.stdout.on('data', (data) => {
                    const output = data.toString();
                    // Optional: parse percentage here
                    io.emit('downloadProgress', { fileName, output });
                });

                child.stderr.on('data', (data) => {
                    io.emit('log', `[${fileName}] DEBUG: ${data.toString().trim()}`);
                });

                return new Promise(resolve => {
                    child.on('close', (code) => {
                        const status = code === 0 ? 'SUCCESS' : 'FAILED';
                        io.emit('log', `${status}: ${fileName} (Exit code: ${code})`);
                        io.emit('downloadFinished', { fileName, status, code });
                        resolve({ fileName, targetFolder, metadata });
                    });
                });
            };

            // Simple concurrency control
            const queue = [...lines];
            const running = new Set();
            const scannedFolders = new Set();

            const processNext = async () => {
                if (queue.length === 0) return;
                const line = queue.shift();
                const promise = runDownload(line);
                running.add(promise);
                
                const result = await promise;
                scannedFolders.add(result);
                running.delete(promise);
                
                if (queue.length > 0) {
                    await processNext();
                }
            };

            const workers = [];
            for (let i = 0; i < Math.min(concurrent, lines.length); i++) {
                workers.push(processNext());
            }

            await Promise.all(workers);

            io.emit('log', 'All downloads finished. Triggering API scans...');
            
            // Trigger API scans
            for (const folderInfo of scannedFolders) {
                const { targetFolder, metadata } = folderInfo;
                try {
                    const settings = metadata.isMovie ? config.Radarr : config.Sonarr;
                    const commandName = metadata.isMovie ? 'DownloadedMoviesScan' : 'DownloadedEpisodesScan';
                    
                    io.emit('log', `Triggering ${commandName} for: ${targetFolder}`);
                    
                    await axios.post(`${settings.BaseUrl}/command`, {
                        name: commandName,
                        path: targetFolder
                    }, {
                        headers: { 'X-Api-Key': settings.ApiKey }
                    });
                } catch (scanError) {
                    io.emit('log', `Scan Trigger Error for ${targetFolder}: ${scanError.message}`);
                }
            }

            await fs.writeFile(commandFile, '');
            io.emit('queueUpdated');
            io.emit('log', 'Ingestion complete.');

        } catch (error) {
            console.error(error);
            io.emit('log', `ERROR during ingestion: ${error.message}`);
        }
    });

    return router;
};
