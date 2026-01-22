/**
 * Boson HTTP API Service
 * 
 * Exposes DHT operations via a RESTful HTTP API.
 * This allows external services (like the Web Gateway) to query the DHT.
 */
package io.bosonnetwork.service.httpapi;

import io.bosonnetwork.Node;
import io.bosonnetwork.Id;
import io.bosonnetwork.Value;
import io.bosonnetwork.service.BosonService;
import io.bosonnetwork.service.ServiceContext;

import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.http.HttpServerResponse;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;
import io.vertx.ext.web.handler.BodyHandler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * HTTP API service for Boson DHT operations.
 * 
 * Endpoints:
 * - GET /api/health - Health check
 * - GET /api/node - Node information
 * - POST /api/dht/store - Store a value in DHT
 * - GET /api/dht/find/:id - Find a value by ID
 * - POST /api/dht/announce - Announce a peer
 * - GET /api/username/:name - Lookup username registration
 * - POST /api/username - Register a username
 */
public class HttpApiService implements BosonService {
    private static final Logger log = LoggerFactory.getLogger(HttpApiService.class);
    
    private static final String USERNAME_PREFIX = "pc2:username:";
    
    private ServiceContext context;
    private Node node;
    private Vertx vertx;
    private HttpServer server;
    private int port = 8091;
    private String host = "127.0.0.1";

    @Override
    public void init(ServiceContext context, Map<String, Object> configuration) {
        this.context = context;
        this.node = context.getNode();
        
        if (configuration.containsKey("port")) {
            this.port = ((Number) configuration.get("port")).intValue();
        }
        if (configuration.containsKey("host")) {
            this.host = (String) configuration.get("host");
        }
        
        log.info("HttpApiService initialized with port: {}, host: {}", port, host);
    }

    @Override
    public void start() {
        vertx = Vertx.vertx();
        Router router = Router.router(vertx);
        
        // Enable body parsing
        router.route().handler(BodyHandler.create());
        
        // CORS headers
        router.route().handler(ctx -> {
            ctx.response()
                .putHeader("Access-Control-Allow-Origin", "*")
                .putHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                .putHeader("Access-Control-Allow-Headers", "Content-Type");
            if (ctx.request().method().name().equals("OPTIONS")) {
                ctx.response().setStatusCode(204).end();
            } else {
                ctx.next();
            }
        });
        
        // Routes
        router.get("/api/health").handler(this::handleHealth);
        router.get("/api/node").handler(this::handleNodeInfo);
        router.get("/api/username/:name").handler(this::handleUsernameLookup);
        router.post("/api/username").handler(this::handleUsernameRegister);
        router.get("/api/dht/find/:id").handler(this::handleDhtFind);
        router.post("/api/dht/store").handler(this::handleDhtStore);
        
        server = vertx.createHttpServer();
        server.requestHandler(router)
            .listen(port, host)
            .onSuccess(s -> log.info("HTTP API server started on {}:{}", host, port))
            .onFailure(e -> log.error("Failed to start HTTP API server", e));
    }

    @Override
    public void stop() {
        if (server != null) {
            server.close();
        }
        if (vertx != null) {
            vertx.close();
        }
        log.info("HttpApiService stopped");
    }

    private void handleHealth(RoutingContext ctx) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("status", "ok")
                .put("service", "boson-http-api")
                .put("nodeId", node.getId().toString())
                .encode());
    }

    private void handleNodeInfo(RoutingContext ctx) {
        ctx.response()
            .putHeader("Content-Type", "application/json")
            .end(new JsonObject()
                .put("nodeId", node.getId().toString())
                .put("address", node.getAddress4() != null ? node.getAddress4().toString() : null)
                .put("port", node.getPort())
                .encode());
    }

    private void handleUsernameLookup(RoutingContext ctx) {
        String username = ctx.pathParam("name").toLowerCase();
        String key = USERNAME_PREFIX + username;
        
        try {
            Id keyId = Id.of(key.getBytes());
            
            node.findValue(keyId).whenComplete((value, error) -> {
                if (error != null) {
                    log.error("Error finding username: {}", username, error);
                    ctx.response()
                        .setStatusCode(500)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject()
                            .put("error", error.getMessage())
                            .encode());
                    return;
                }
                
                if (value == null) {
                    ctx.response()
                        .setStatusCode(404)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject()
                            .put("error", "Username not found")
                            .put("username", username)
                            .encode());
                    return;
                }
                
                try {
                    String data = new String(value.getData());
                    JsonObject result = new JsonObject(data);
                    result.put("username", username);
                    
                    ctx.response()
                        .putHeader("Content-Type", "application/json")
                        .end(result.encode());
                } catch (Exception e) {
                    ctx.response()
                        .setStatusCode(500)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject()
                            .put("error", "Invalid value format")
                            .encode());
                }
            });
        } catch (Exception e) {
            log.error("Error looking up username: {}", username, e);
            ctx.response()
                .setStatusCode(500)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject()
                    .put("error", e.getMessage())
                    .encode());
        }
    }

    private void handleUsernameRegister(RoutingContext ctx) {
        JsonObject body = ctx.body().asJsonObject();
        
        if (body == null) {
            ctx.response()
                .setStatusCode(400)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("error", "Invalid JSON body").encode());
            return;
        }
        
        String username = body.getString("username", "").toLowerCase();
        String nodeId = body.getString("nodeId");
        String endpoint = body.getString("endpoint");
        
        if (username.isEmpty() || nodeId == null || endpoint == null) {
            ctx.response()
                .setStatusCode(400)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("error", "Missing required fields: username, nodeId, endpoint").encode());
            return;
        }
        
        String key = USERNAME_PREFIX + username;
        JsonObject valueData = new JsonObject()
            .put("nodeId", nodeId)
            .put("endpoint", endpoint)
            .put("registered", System.currentTimeMillis());
        
        try {
            Id keyId = Id.of(key.getBytes());
            Value value = Value.of(valueData.encode().getBytes());
            
            node.storeValue(value).whenComplete((result, error) -> {
                if (error != null) {
                    log.error("Error storing username: {}", username, error);
                    ctx.response()
                        .setStatusCode(500)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject()
                            .put("error", error.getMessage())
                            .encode());
                    return;
                }
                
                log.info("Username registered: {} -> {}", username, endpoint);
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .end(new JsonObject()
                        .put("success", true)
                        .put("username", username)
                        .encode());
            });
        } catch (Exception e) {
            log.error("Error registering username: {}", username, e);
            ctx.response()
                .setStatusCode(500)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject()
                    .put("error", e.getMessage())
                    .encode());
        }
    }

    private void handleDhtFind(RoutingContext ctx) {
        String idStr = ctx.pathParam("id");
        
        try {
            Id id = Id.of(idStr);
            
            node.findValue(id).whenComplete((value, error) -> {
                if (error != null) {
                    ctx.response()
                        .setStatusCode(500)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject().put("error", error.getMessage()).encode());
                    return;
                }
                
                if (value == null) {
                    ctx.response()
                        .setStatusCode(404)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject().put("error", "Value not found").encode());
                    return;
                }
                
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .end(new JsonObject()
                        .put("id", id.toString())
                        .put("data", new String(value.getData()))
                        .encode());
            });
        } catch (Exception e) {
            ctx.response()
                .setStatusCode(400)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("error", "Invalid ID: " + e.getMessage()).encode());
        }
    }

    private void handleDhtStore(RoutingContext ctx) {
        JsonObject body = ctx.body().asJsonObject();
        
        if (body == null) {
            ctx.response()
                .setStatusCode(400)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("error", "Invalid JSON body").encode());
            return;
        }
        
        String data = body.getString("data");
        if (data == null) {
            ctx.response()
                .setStatusCode(400)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("error", "Missing 'data' field").encode());
            return;
        }
        
        try {
            Value value = Value.of(data.getBytes());
            
            node.storeValue(value).whenComplete((result, error) -> {
                if (error != null) {
                    ctx.response()
                        .setStatusCode(500)
                        .putHeader("Content-Type", "application/json")
                        .end(new JsonObject().put("error", error.getMessage()).encode());
                    return;
                }
                
                ctx.response()
                    .putHeader("Content-Type", "application/json")
                    .end(new JsonObject()
                        .put("success", true)
                        .put("id", value.getId().toString())
                        .encode());
            });
        } catch (Exception e) {
            ctx.response()
                .setStatusCode(500)
                .putHeader("Content-Type", "application/json")
                .end(new JsonObject().put("error", e.getMessage()).encode());
        }
    }
}
