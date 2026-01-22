// const { Client } = require('ssh2');
// const axios = require('axios');
// const fs = require('fs');

// // Configuration
// const config = {
//   whm: {
//     host: 'pcp3.mywebsitebox.com',
//     port: 2087,
//     username: 'root',
//     token: 'DRBNK459UIU6DQQN3H9TQACJKAA78O6D'
//   },
//   cpanel: {
//     user: 'x98aailqrs',
//     passphrase: '73v3nE1v!$'
//   },
//   ssh: {
//     port: 22022,
//     keyName: 'bot_automation_key'
//   }
// };

// class AutomatedWPRepair {
//   constructor() {
//     this.sshConnection = null;
//     this.privateKey = null;
//   }

//   // Step 1: Generate SSH key via cPanel API
//   async generateSSHKey() {
//     console.log('🔑 Generating SSH key via cPanel API...');
    
//     try {
//       const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
//       const params = {
//         'api.version': 1,
//         user: config.cpanel.user,
//         cpanel_jsonapi_user: config.cpanel.user,
//         cpanel_jsonapi_module: 'SSH',
//         cpanel_jsonapi_func: 'genkey',
//         name: config.ssh.keyName,
//         passphrase: config.cpanel.passphrase
//       };

//       const response = await axios.get(url, {
//         params,
//         headers: {
//           'Authorization': `whm ${config.whm.username}:${config.whm.token}`
//         },
//         httpsAgent: new (require('https').Agent)({
//           rejectUnauthorized: false
//         })
//       });

//       if (response.data.cpanelresult.data[0].result === 1) {
//         console.log('✅ SSH key generated successfully');
//         console.log('Key details:', response.data.cpanelresult.data[0].reason);
//         return true;
//       } else {
//         throw new Error('Failed to generate SSH key');
//       }
//     } catch (error) {
//       console.error('❌ Error generating SSH key:', error.message);
//       return false;
//     }
//   }

//   // Step 2: Authorize SSH key
//   async authorizeSSHKey() {
//     console.log('🔐 Authorizing SSH key...');
    
//     try {
//       const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
//       const params = {
//         'api.version': 1,
//         user: config.cpanel.user,
//         cpanel_jsonapi_user: config.cpanel.user,
//         cpanel_jsonapi_module: 'SSH',
//         cpanel_jsonapi_func: 'authkey',
//         key: config.ssh.keyName,
//         action: 'authorize'
//       };

//       const response = await axios.get(url, {
//         params,
//         headers: {
//           'Authorization': `whm ${config.whm.username}:${config.whm.token}`
//         },
//         httpsAgent: new (require('https').Agent)({
//           rejectUnauthorized: false
//         })
//       });

//       if (response.data.cpanelresult.data[0].status === 'authorized') {
//         console.log('✅ SSH key authorized successfully');
//         return true;
//       } else {
//         throw new Error('Failed to authorize SSH key');
//       }
//     } catch (error) {
//       console.error('❌ Error authorizing SSH key:', error.message);
//       return false;
//     }
//   }

//   // Step 3: Fetch private SSH key
//   async fetchPrivateKey() {
//     console.log('📥 Fetching private SSH key...');
    
//     try {
//       const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
//       const params = {
//         'api.version': 1,
//         user: config.cpanel.user,
//         cpanel_jsonapi_user: config.cpanel.user,
//         cpanel_jsonapi_module: 'SSH',
//         cpanel_jsonapi_func: 'fetchkey',
//         name: config.ssh.keyName
//       };

//       const response = await axios.get(url, {
//         params,
//         headers: {
//           'Authorization': `whm ${config.whm.username}:${config.whm.token}`
//         },
//         httpsAgent: new (require('https').Agent)({
//           rejectUnauthorized: false
//         })
//       });

//       if (response.data.cpanelresult.data && response.data.cpanelresult.data[0]) {
//         this.privateKey = response.data.cpanelresult.data[0].key;
//         console.log('✅ Private SSH key fetched successfully');
//         return true;
//       } else {
//         throw new Error('Failed to fetch private SSH key');
//       }
//     } catch (error) {
//       console.error('❌ Error fetching private SSH key:', error.message);
//       return false;
//     }
//   }

//   // Step 5: Clean up SSH key
//   async deleteSSHKey() {
//     console.log('🧹 Cleaning up SSH key...');
    
//     try {
//       const url = `https://${config.whm.host}:${config.whm.port}/json-api/cpanel_api2`;
//       const params = {
//         'api.version': 1,
//         user: config.cpanel.user,
//         cpanel_jsonapi_user: config.cpanel.user,
//         cpanel_jsonapi_module: 'SSH',
//         cpanel_jsonapi_func: 'delkey',
//         name: config.ssh.keyName
//       };

//       const response = await axios.get(url, {
//         params,
//         headers: {
//           'Authorization': `whm ${config.whm.username}:${config.whm.token}`
//         },
//         httpsAgent: new (require('https').Agent)({
//           rejectUnauthorized: false
//         })
//       });

//       if (response.data.cpanelresult.data && response.data.cpanelresult.data[0]) {
//         console.log('✅ SSH key deleted successfully');
//         console.log('Deleted key:', response.data.cpanelresult.data[0].name);
//         return true;
//       } else {
//         throw new Error('Failed to delete SSH key');
//       }
//     } catch (error) {
//       console.error('❌ Error deleting SSH key:', error.message);
//       return false;
//     }
//   }
//   async connectAndRepairWordPress() {
//     return new Promise((resolve, reject) => {
//       console.log('🔌 Connecting via SSH...');
      
//       const conn = new Client();
      
//       conn.on('ready', () => {
//         console.log('✅ SSH Connection established');
//         console.log('🔍 Starting WordPress core checksum verification...');
        
//         // Execute wp core verify-checksums command
//         conn.exec(`cd /home/${config.cpanel.user}/public_html/ && wp core verify-checksums --allow-root`, (err, stream) => {
//           if (err) {
//             console.error('Error executing command:', err);
//             conn.end();
//             reject(err);
//             return;
//           }
          
//           let output = '';
//           let errorOutput = '';
          
//           stream.on('close', (code, signal) => {
//             console.log('\n=== WordPress Core Checksum Verification Results ===');
//             console.log('Exit code:', code);
            
//             if (output.trim()) {
//               console.log('\nOutput:');
//               console.log(output);
//             }
            
//             if (errorOutput.trim()) {
//               console.log('\nError Output:');
//               console.log(errorOutput);
//             }
            
//             // If checksum verification failed, run wp core download --force
//             if (code !== 0) {
//               console.log('\n❌ WordPress core files verification failed');
//               console.log('⚠️  Some WordPress core files may be modified or corrupted');
//               console.log('\n🔄 Running wp core download --force to restore core files...');
              
//               // Run wp core download --force to restore WordPress core files
//               conn.exec(`cd /home/${config.cpanel.user}/public_html/ && wp core download --force --allow-root`, (err, downloadStream) => {
//                 if (err) {
//                   console.error('Error executing wp core download:', err);
//                   conn.end();
//                   reject(err);
//                   return;
//                 }
                
//                 let downloadOutput = '';
//                 let downloadErrorOutput = '';
                
//                 downloadStream.on('close', (downloadCode, downloadSignal) => {
//                   console.log('\n=== WordPress Core Download Results ===');
//                   console.log('Exit code:', downloadCode);
                  
//                   if (downloadOutput.trim()) {
//                     console.log('\nOutput:');
//                     console.log(downloadOutput);
//                   }
                  
//                   if (downloadErrorOutput.trim()) {
//                     console.log('\nError Output:');
//                     console.log(downloadErrorOutput);
//                   }
                  
//                   if (downloadCode === 0) {
//                     console.log('\n✅ WordPress core files have been restored successfully');
//                     console.log('🔄 Running final checksum verification...');
                    
//                     // Verify checksums again after download
//                     conn.exec(`cd /home/${config.cpanel.user}/public_html/ && wp core verify-checksums --allow-root`, (err, verifyStream) => {
//                       if (err) {
//                         console.error('Error executing second verification:', err);
//                         conn.end();
//                         reject(err);
//                         return;
//                       }
                      
//                       let verifyOutput = '';
//                       let verifyErrorOutput = '';
                      
//                       verifyStream.on('close', (verifyCode, verifySignal) => {
//                         console.log('\n=== Final Checksum Verification Results ===');
//                         console.log('Exit code:', verifyCode);
                        
//                         if (verifyOutput.trim()) {
//                           console.log('\nOutput:');
//                           console.log(verifyOutput);
//                         }
                        
//                         if (verifyErrorOutput.trim()) {
//                           console.log('\nError Output:');
//                           console.log(verifyErrorOutput);
//                         }
                        
//                         if (verifyCode === 0) {
//                           console.log('\n✅ WordPress core files verification now passes!');
//                           console.log('✅ All WordPress core files are intact and unmodified');
//                         } else {
//                           console.log('\n⚠️  WordPress core files still have issues after restoration');
//                         }
                        
//                         conn.end();
//                         resolve({
//                           success: verifyCode === 0,
//                           repaired: true,
//                           finalVerification: verifyCode === 0
//                         });
//                       }).on('data', (data) => {
//                         verifyOutput += data.toString();
//                       }).stderr.on('data', (data) => {
//                         verifyErrorOutput += data.toString();
//                       });
//                     });
//                   } else {
//                     console.log('\n❌ WordPress core download failed');
//                     conn.end();
//                     resolve({
//                       success: false,
//                       repaired: false,
//                       error: 'Core download failed'
//                     });
//                   }
//                 }).on('data', (data) => {
//                   downloadOutput += data.toString();
//                 }).stderr.on('data', (data) => {
//                   downloadErrorOutput += data.toString();
//                 });
//               });
//             } else {
//               console.log('\n✅ WordPress core files verification completed successfully');
//               console.log('✅ All WordPress core files are intact and unmodified');
//               conn.end();
//               resolve({
//                 success: true,
//                 repaired: false,
//                 alreadyValid: true
//               });
//             }
//           }).on('data', (data) => {
//             output += data.toString();
//           }).stderr.on('data', (data) => {
//             errorOutput += data.toString();
//           });
//         });
//       }).on('error', (err) => {
//         console.error('SSH Connection error:', err);
//         reject(err);
//       }).connect({
//         host: config.whm.host,
//         port: config.ssh.port,
//         username: config.cpanel.user,
//         privateKey: this.privateKey,
//         passphrase: config.cpanel.passphrase,
//         readyTimeout: 20000,
//         keepaliveInterval: 1000
//       });
//     });
//   }

//   // Main execution function
//   async run() {
//     console.log('🚀 Starting Automated WordPress Repair Process...\n');
    
//     let keyGenerated = false;
    
//     try {
//       // Step 1: Generate SSH key
//       keyGenerated = await this.generateSSHKey();
//       if (!keyGenerated) {
//         throw new Error('Failed to generate SSH key');
//       }

//       // Step 2: Authorize SSH key
//       const keyAuthorized = await this.authorizeSSHKey();
//       if (!keyAuthorized) {
//         throw new Error('Failed to authorize SSH key');
//       }

//       // Step 3: Fetch private key
//       const keyFetched = await this.fetchPrivateKey();
//       if (!keyFetched) {
//         throw new Error('Failed to fetch private key');
//       }

//       // Step 4: Connect and repair WordPress
//       const result = await this.connectAndRepairWordPress();
      
//       console.log('\n🎉 Automated WordPress Repair Process Completed!');
//       console.log('Results:', result);
      
//       return result;
//     } catch (error) {
//       console.error('❌ Automated repair process failed:', error.message);
//       throw error;
//     } finally {
//       // Step 5: Always clean up SSH key (whether success or failure)
//       if (keyGenerated) {
//         console.log('\n🧹 Performing cleanup...');
//         await this.deleteSSHKey();
//       }
//     }
//   }
// }

// // Execute the automated repair
// const repair = new AutomatedWPRepair();
// repair.run()
//   .then(result => {
//     console.log('\n✅ Process completed successfully');
//     process.exit(0);
//   })
//   .catch(error => {
//     console.error('\n❌ Process failed:', error.message);
//     process.exit(1);
//   });