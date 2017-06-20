/*jslint node: true, nomen: true */
/*
    Requirements: Robot Framework & Python
    This script uses the `robot.libdoc` tool included in the robot framework to generate the documentation files
    More info: http://robotframework.org/robotframework/latest/RobotFrameworkUserGuide.html#libdoc
*/
var fileSystem = require("fs"),
    https = require("https"),
    executeCmd = require("child_process").exec,
    currentFolderPath = __dirname,
    docsFolder = currentFolderPath + "/../private/docs", // relative path to local folder to docs 
    githubAccessToken = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // access token to github api
    githubHostname = "api.github.com",
    githubKeywordsPath = "/repos/user/PathToKeywordFiles/Keywords"; // path to repo containing keyword files

// generate documentation files using the doclib utility
function generateDocsFile(keywordFilePath, callback) {
    "use strict";
    var docFilePath = keywordFilePath + ".html",
        libtoolCommand = "python -m robot.libdoc " + keywordFilePath + " " + docFilePath;
    executeCmd(libtoolCommand, function (err, stdout, stderr) {
        if (err) { throw err; }
        if (stderr !== undefined && stderr !== "") { console.log(stderr); }
        console.log(stdout);
        fileSystem.unlink(keywordFilePath, callback);
    });
}

// delete existing doc files
function deleteExistingDocFiles(parentFolder, callback) {
    "use strict";
    var deleteFileOrFolder = function (path, delCallback) {
        fileSystem.stat(path, function (err, stats) {
            if (err) { throw err; }
            if (stats.isDirectory()) {
                deleteExistingDocFiles(path, function () {
                    fileSystem.rmdir(path, delCallback);
                });
            } else if (stats.isFile()) {
                fileSystem.unlink(path, delCallback);
            }
        });
    };
    fileSystem.readdir(parentFolder, function (err, files) {
        var fileOrFolderPath,
            fileIndex,
            filesDeletedCount = 0,
            onDeleted = function (err) {
                if (err) { throw err; }
                filesDeletedCount += 1;
                if (filesDeletedCount >= files.length) {
                    callback();
                }
            };
        if (err) { throw err; }
        for (fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
            fileOrFolderPath = parentFolder + "/" + files[fileIndex];
            deleteFileOrFolder(fileOrFolderPath, onDeleted);
        }
        if (files.length === 0) {
            callback();
        }
    });
}

// recursively get all keyword robot files on Automation_Tests github repo
function downloadKeywordFilesFromGit(parentPath, parentLocalPath, callback) {
    "use strict";
    var downloadFile = function (gitFile, targetFolder, downloadCallback) {
            var filePath = targetFolder === undefined ?
                    docsFolder + "/" + gitFile.name :
                    docsFolder + "/" + targetFolder + "/" + gitFile.name,
                localFile = fileSystem.createWriteStream(filePath),
                request = https.get(gitFile.download_url, function (response) {
                    response.pipe(localFile);
                    localFile.on("finish", function () {
                        localFile.close(function () {
                            generateDocsFile(filePath, downloadCallback);
                        });
                    });
                });
        },
        requestOptions = {
            hostname: githubHostname,
            path: parentPath,
            method: "GET",
            headers: {
                "Authorization": "token " + githubAccessToken,
                "User-Agent": "Augury Automation Framework",
                "Accept": "application/json"
            }
        },
        request = https.request(requestOptions, function (result) {
            var resultData = "";
            result.on("data", function (data) { resultData += data; });
            result.on("end", function () {
                var filesAndFolders = JSON.parse(resultData),
                    i,
                    folderPathUrl,
                    folderLocalPath,
                    filesDownloadCount = 0,
                    onFileDownloaded = function () {
                        filesDownloadCount += 1;
                        if (filesDownloadCount >= filesAndFolders.length) {
                            callback();
                        }
                    };
                for (i = 0; i < filesAndFolders.length; i += 1) {
                    if (filesAndFolders[i].type === "dir") {
                        folderLocalPath =
                            parentLocalPath === undefined ?
                                    filesAndFolders[i].name :
                                    parentLocalPath + "/" + filesAndFolders[i].name;
                        fileSystem.mkdir(docsFolder + "/" + folderLocalPath);
                        folderPathUrl = parentPath + "/" + filesAndFolders[i].name;
                        downloadKeywordFilesFromGit(folderPathUrl, folderLocalPath, onFileDownloaded);
                    } else if (filesAndFolders[i].type === "file"
                               && filesAndFolders[i].name.toLowerCase().endsWith(".robot")) {
                        downloadFile(filesAndFolders[i], parentLocalPath, onFileDownloaded);
                    } else {
                        onFileDownloaded();
                    }
                }
                if (filesAndFolders.length === 0) {
                    callback();
                }
            });
        });
    request.on("error", function (err) { throw err; });
    request.end();
}

module.exports.updateDocs = function () {
    "use strict";
    deleteExistingDocFiles(docsFolder, function () {
        downloadKeywordFilesFromGit(githubKeywordsPath, undefined, function () {
            console.log("done.");
        });
    });
};
