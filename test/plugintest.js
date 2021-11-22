const assert = require('chai').assert;
const {plugin} = require('../index.js');
const Hapi = require('@hapi/hapi');

let server;
describe('Server Testing', function () {
    this.beforeAll('Set up server and load plugin', async function () {
        server = new Hapi.Server({
            host: '0.0.0.0',
            port: 8080
        });
        await server.register({
            plugin: plugin,
            options: {
                root: '/test'
            }
        })
    });
    it('should validate that the server is running', function () {
        return server.inject({
            method: 'GET',
            url: '/isReady'
        }).then(
            function (response) {
                assert.deepEqual(response.statusCode, 404);
            }
        )
    });
    it('Should validate our endpoint is mounted', function () {
        return server.inject({
            method: 'GET',
            url: '/test/test'
        }).then(
            function (response) {
                assert.deepEqual(response.statusCode, 200);

            }
        )
    });
    it('Should fail to launch plugin without complete configuration', async function () {
        try {
            server2 = new Hapi.Server({
                host: '0.0.0.0',
                port: 1234
            });
            await server2.register({
                plugin: plugin,
                options: {

                }
            })
            assert.isTrue(false,"Should not get here");
        }
        catch(err){
            assert.equal(err.message,'"root" is required',"Checking error message")
        }

    });
    it('Should launch plugin with complete configuration', async function () {
        try {
            server2 = new Hapi.Server({
                host: '0.0.0.0',
                port: 1234
            });
            await server2.register({
                plugin: plugin,
                options: {
                    root:'/test2'
                }
            })
            assert.isTrue(true,"Should get here");
        }
        catch(err){
            console.error(err.message);
            assert.isTrue(false,"Should not get here");
        }

    });
});
