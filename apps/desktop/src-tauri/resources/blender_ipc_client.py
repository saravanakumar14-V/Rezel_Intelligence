import sys
import socket
import base64
import os
import json
import struct
import math
import bpy

# Robust WebSocket Client in standard Python (zero external dependencies)
class RezelWSClient:
    def __init__(self, host, port, token, launch_id):
        self.host = host
        self.port = port
        self.token = token
        self.launch_id = launch_id
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((host, port))
        self.buffer = bytearray()
        
        # WebSocket Handshake (RFC 6455)
        key = base64.b64encode(os.urandom(16)).decode('utf-8')
        req = (f"GET / HTTP/1.1\r\n"
               f"Host: {host}:{port}\r\n"
               f"Upgrade: websocket\r\n"
               f"Connection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\n"
               f"Sec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode('utf-8'))
        resp = self.sock.recv(4096)
        
        # Capability Registrations
        capabilities = [
            {
                "name": "blender.inspect_scene",
                "description": "Returns a structured list of all objects, collections, and scene state in the current Blender scene.",
                "parameters": {},
                "risk": "LOW"
            },
            {
                "name": "blender.create_object",
                "description": "Creates a primitive 3D object in the scene.",
                "parameters": {
                    "type": {"type": "string", "description": "Type of object (CUBE, SPHERE, PLANE, CYLINDER)", "enum": ["CUBE", "SPHERE", "PLANE", "CYLINDER"]},
                    "name": {"type": "string", "description": "Name of the object"},
                    "location": {"type": "array", "description": "Location [x, y, z]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.create_camera",
                "description": "Creates a camera in the scene.",
                "parameters": {
                    "name": {"type": "string", "description": "Name of the camera"},
                    "location": {"type": "array", "description": "Location [x, y, z]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.create_empty",
                "description": "Creates an empty object in the active Blender scene.",
                "parameters": {
                    "name": {"type": "string", "description": "Name of the empty"},
                    "emptyType": {"type": "string", "description": "Empty display type"},
                    "location": {"type": "array", "description": "Location [x, y, z]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.create_light",
                "description": "Creates a light object in the active Blender scene.",
                "parameters": {
                    "name": {"type": "string", "description": "Name of the light"},
                    "type": {"type": "string", "description": "Light type (POINT, SUN, SPOT, AREA)"},
                    "location": {"type": "array", "description": "Location [x, y, z]", "items": {"type": "number"}},
                    "energy": {"type": "number", "description": "Light intensity / energy in Watts"},
                    "color": {"type": "array", "description": "RGB color [r, g, b]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.transform_object",
                "description": "Transforms an existing object (location, rotation, scale).",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object ID or name"},
                    "location": {"type": "array", "description": "Location [x, y, z]", "items": {"type": "number"}},
                    "rotation": {"type": "array", "description": "Euler rotation [x, y, z] in radians", "items": {"type": "number"}},
                    "rotationMode": {"type": "string", "description": "Rotation mode e.g. XYZ"},
                    "scale": {"type": "array", "description": "Scale [x, y, z]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.rename_object",
                "description": "Renames an existing object.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object ID or name"},
                    "newName": {"type": "string", "description": "New unique name for the object"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.delete_object",
                "description": "Deletes an existing object from the Blender scene.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object ID or name"}
                },
                "risk": "CRITICAL"
            },
            {
                "name": "blender.project.save",
                "description": "Saves the current Blender project file.",
                "parameters": {},
                "risk": "HIGH"
            },
            {
                "name": "blender.project.save_as",
                "description": "Saves the current Blender project file to an authorized path.",
                "parameters": {
                    "filepath": {"type": "string", "description": "Absolute destination file path"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.scene.create",
                "description": "Creates a new scene in the Blender project.",
                "parameters": {
                    "name": {"type": "string", "description": "Unique name of the new scene"},
                    "setActive": {"type": "boolean", "description": "Whether to switch active scene"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.scene.switch",
                "description": "Switches the active scene in Blender.",
                "parameters": {
                    "sceneName": {"type": "string", "description": "Name of the target scene"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.collection.create",
                "description": "Creates a new collection in the Blender scene.",
                "parameters": {
                    "name": {"type": "string", "description": "Name of the new collection"},
                    "parentCollection": {"type": "string", "description": "Optional parent collection"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.object.move_to_collection",
                "description": "Moves an object into a specified collection.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object name or ID"},
                    "targetCollection": {"type": "string", "description": "Destination collection name"},
                    "unlinkFromOthers": {"type": "boolean", "description": "Unlink from previous collections"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.object.duplicate",
                "description": "Duplicates an object in Blender.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object name or ID"},
                    "newName": {"type": "string", "description": "Optional name for duplicate"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.object.set_visibility",
                "description": "Sets viewport and render visibility for an object.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object name or ID"},
                    "viewport": {"type": "boolean", "description": "Viewport visibility"},
                    "render": {"type": "boolean", "description": "Render visibility"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.object.set_active",
                "description": "Sets active and selected state for an object.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object name or ID"},
                    "selected": {"type": "boolean", "description": "Whether to select object"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.object.parent",
                "description": "Parents an object to another object with cycle prevention.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Child object name or ID"},
                    "parentId": {"type": "string", "description": "Parent object name or ID"},
                    "keepTransform": {"type": "boolean", "description": "Preserve world transform"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.object.unparent",
                "description": "Clears parent from an object.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Child object name or ID"},
                    "keepTransform": {"type": "boolean", "description": "Preserve world transform"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.material.create",
                "description": "Creates a new material in Blender.",
                "parameters": {
                    "name": {"type": "string", "description": "Name of the material"},
                    "color": {"type": "array", "description": "RGBA color [r, g, b, a]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.material.assign",
                "description": "Assigns a material to an object.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object name or ID"},
                    "materialName": {"type": "string", "description": "Target material name"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.material.set_color",
                "description": "Sets the base color on a material.",
                "parameters": {
                    "materialName": {"type": "string", "description": "Material name"},
                    "color": {"type": "array", "description": "RGB/RGBA color", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.animation.insert_keyframe",
                "description": "Inserts a keyframe on an object transform property.",
                "parameters": {
                    "objectId": {"type": "string", "description": "Target object name or ID"},
                    "property": {"type": "string", "description": "Property: location, rotation_euler, scale", "enum": ["location", "rotation_euler", "scale"]},
                    "frame": {"type": "number", "description": "Timeline frame number"},
                    "value": {"type": "array", "description": "Optional value [x, y, z]", "items": {"type": "number"}}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.render.image",
                "description": "Renders a still frame to a specified output file.",
                "parameters": {
                    "outputPath": {"type": "string", "description": "Absolute output file path"},
                    "format": {"type": "string", "description": "Image format: PNG, JPEG, OPEN_EXR"},
                    "frame": {"type": "number", "description": "Frame number to render"}
                },
                "risk": "HIGH"
            },
            {
                "name": "blender.export.asset",
                "description": "Exports scene or asset to a file.",
                "parameters": {
                    "outputPath": {"type": "string", "description": "Absolute output file path"},
                    "format": {"type": "string", "description": "Export format: GLTF, FBX, OBJ, STL", "enum": ["GLTF", "FBX", "OBJ", "STL"]}
                },
                "risk": "HIGH"
            }
        ]
        
        auth_msg = {
            "type": "auth",
            "token": self.token,
            "client_id": "blender",
            "launch_id": self.launch_id,
            "process_id": os.getpid(),
            "capabilities": capabilities
        }
        self.send_json(auth_msg)
        self.sock.setblocking(False)

    def send_json(self, obj):
        try:
            payload = json.dumps(obj).encode('utf-8')
            header = bytearray([0x81]) # FIN + Text Frame
            length = len(payload)
            if length < 126:
                header.append(length | 0x80)
            elif length < 65536:
                header.append(126 | 0x80)
                header.extend(struct.pack("!H", length))
            else:
                header.append(127 | 0x80)
                header.extend(struct.pack("!Q", length))
                
            mask = os.urandom(4)
            header.extend(mask)
            
            masked_payload = bytearray(payload)
            for i in range(len(masked_payload)):
                masked_payload[i] ^= mask[i % 4]
                
            self.sock.setblocking(True)
            self.sock.sendall(header + masked_payload)
            self.sock.setblocking(False)
        except Exception as e:
            print("[Rezel IPC] Error sending message:", e)

    def recv_messages(self):
        while True:
            try:
                chunk = self.sock.recv(8192)
                if not chunk:
                    return None # Socket closed by server
                self.buffer.extend(chunk)
            except BlockingIOError:
                break
            except Exception as e:
                print("[Rezel IPC] Socket read error:", e)
                return None

        messages = []
        while len(self.buffer) >= 2:
            byte0 = self.buffer[0]
            byte1 = self.buffer[1]
            
            opcode = byte0 & 0x0F
            is_masked = bool(byte1 & 0x80)
            payload_len = byte1 & 0x7F
            
            header_len = 2
            if payload_len == 126:
                if len(self.buffer) < 4:
                    break
                payload_len = struct.unpack("!H", self.buffer[2:4])[0]
                header_len = 4
            elif payload_len == 127:
                if len(self.buffer) < 10:
                    break
                payload_len = struct.unpack("!Q", self.buffer[2:10])[0]
                header_len = 10
                
            mask_len = 4 if is_masked else 0
            total_frame_len = header_len + mask_len + payload_len
            
            if len(self.buffer) < total_frame_len:
                break
                
            payload_data = self.buffer[header_len + mask_len : total_frame_len]
            if is_masked:
                mask = self.buffer[header_len : header_len + 4]
                payload_data = bytearray(payload_data)
                for i in range(len(payload_data)):
                    payload_data[i] ^= mask[i % 4]
                    
            del self.buffer[:total_frame_len]
            
            if opcode == 1: # Text frame
                try:
                    text = payload_data.decode('utf-8')
                    messages.append(json.loads(text))
                except Exception as e:
                    print("[Rezel IPC] JSON parse error:", e)
            elif opcode == 8: # Close frame
                return None
            elif opcode == 9: # Ping frame -> send Pong
                pong = bytearray([0x8A, 0x00])
                try:
                    self.sock.setblocking(True)
                    self.sock.sendall(pong)
                    self.sock.setblocking(False)
                except Exception:
                    pass

        return messages


def handle_create_object(args):
    obj_type = str(args.get("type", "CUBE")).upper()
    name = str(args.get("name", "Cube"))
    loc_raw = args.get("location", [0, 0, 0])
    loc = tuple(float(x) for x in loc_raw) if isinstance(loc_raw, (list, tuple)) and len(loc_raw) == 3 else (0.0, 0.0, 0.0)

    # 1. Duplicate check: never silently overwrite or let Blender auto-rename to name.001
    if name in bpy.data.objects:
        raise ValueError(f"Object with name '{name}' already exists in Blender scene")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if not scene:
        raise RuntimeError("No active Blender scene available")

    # 2. Pure bpy.data mesh geometry construction (100% context-independent)
    if obj_type == "CUBE":
        mesh_data = bpy.data.meshes.new(name=f"{name}_mesh")
        verts = [
            (-1.0, -1.0, -1.0),
            (1.0, -1.0, -1.0),
            (1.0, 1.0, -1.0),
            (-1.0, 1.0, -1.0),
            (-1.0, -1.0, 1.0),
            (1.0, -1.0, 1.0),
            (1.0, 1.0, 1.0),
            (-1.0, 1.0, 1.0),
        ]
        faces = [
            (0, 1, 2, 3),
            (4, 7, 6, 5),
            (0, 4, 5, 1),
            (1, 5, 6, 2),
            (2, 6, 7, 3),
            (3, 7, 4, 0),
        ]
        mesh_data.from_pydata(verts, [], faces)
        mesh_data.update()
    elif obj_type == "PLANE":
        mesh_data = bpy.data.meshes.new(name=f"{name}_mesh")
        verts = [(-1.0, -1.0, 0.0), (1.0, -1.0, 0.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0)]
        faces = [(0, 1, 2, 3)]
        mesh_data.from_pydata(verts, [], faces)
        mesh_data.update()
    elif obj_type == "SPHERE" or obj_type == "CYLINDER":
        mesh_data = bpy.data.meshes.new(name=f"{name}_mesh")
        verts = [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5),
                 (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)]
        faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        mesh_data.from_pydata(verts, [], faces)
        mesh_data.update()
    else:
        raise ValueError(f"Invalid object type: {obj_type}")

    obj = bpy.data.objects.new(name=name, object_data=mesh_data)
    obj.location = loc

    # Link to active scene collection
    target_col = bpy.context.collection if bpy.context.collection else scene.collection
    target_col.objects.link(obj)

    # Force view layer update so Outliner and scene graph evaluate immediately
    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    # 3. MANDATORY POST-CREATION MUTATION TRUTH CHECK & DIAGNOSTICS
    verified_obj = bpy.data.objects.get(name)
    if verified_obj is None:
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Object '{name}' not found in bpy.data.objects after creation",
            "verification": {"exists": False}
        }

    if verified_obj.name != name:
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Object was renamed to '{verified_obj.name}' instead of exact requested name '{name}'",
            "verification": {"exists": True, "exact_name_match": False, "actual_name": verified_obj.name}
        }

    if verified_obj.type != "MESH":
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Expected type 'MESH', got '{verified_obj.type}'",
            "verification": {"exists": True, "type_match": False, "actual_type": verified_obj.type}
        }

    if verified_obj.name not in scene.objects:
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Object '{name}' is not in active scene collection",
            "verification": {"exists": True, "in_scene": False}
        }

    return {
        "success": True,
        "name": verified_obj.name,
        "type": verified_obj.type,
        "location": [float(verified_obj.location.x), float(verified_obj.location.y), float(verified_obj.location.z)],
        "scene_name": scene.name,
        "collection_name": target_col.name,
        "blender_pid": os.getpid(),
        "in_active_scene": True,
        "verification": {
            "exists": True,
            "exact_name_match": True,
            "type_match": True,
            "in_scene": True
        }
    }


def handle_create_camera(args):
    name = str(args.get("name", "Camera"))
    loc_raw = args.get("location", [0, 0, 0])
    loc = tuple(float(x) for x in loc_raw) if isinstance(loc_raw, (list, tuple)) and len(loc_raw) == 3 else (0.0, 0.0, 0.0)

    # 1. Duplicate check: never silently overwrite or let Blender auto-rename to name.001
    if name in bpy.data.objects:
        raise ValueError(f"Object with name '{name}' already exists in Blender scene")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if not scene:
        raise RuntimeError("No active Blender scene available")

    # 2. Pure data-layer camera creation
    cam_data = bpy.data.cameras.new(name=f"{name}_data")
    cam_obj = bpy.data.objects.new(name=name, object_data=cam_data)
    cam_obj.location = loc

    target_col = bpy.context.collection if bpy.context.collection else scene.collection
    target_col.objects.link(cam_obj)

    if not scene.camera:
        scene.camera = cam_obj

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    # 3. MANDATORY POST-CREATION MUTATION TRUTH CHECK & DIAGNOSTICS
    verified_obj = bpy.data.objects.get(name)
    if verified_obj is None:
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Camera '{name}' not found in bpy.data.objects after creation",
            "verification": {"exists": False}
        }

    if verified_obj.name != name:
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Camera was renamed to '{verified_obj.name}' instead of exact requested name '{name}'",
            "verification": {"exists": True, "exact_name_match": False, "actual_name": verified_obj.name}
        }

    if verified_obj.type != "CAMERA":
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Expected type 'CAMERA', got '{verified_obj.type}'",
            "verification": {"exists": True, "type_match": False, "actual_type": verified_obj.type}
        }

    if verified_obj.name not in scene.objects:
        return {
            "success": False,
            "error": f"Mutation truth verification failed: Camera '{name}' is not in active scene collection",
            "verification": {"exists": True, "in_scene": False}
        }

    return {
        "success": True,
        "name": verified_obj.name,
        "type": verified_obj.type,
        "location": [float(verified_obj.location.x), float(verified_obj.location.y), float(verified_obj.location.z)],
        "scene_name": scene.name,
        "collection_name": target_col.name,
        "blender_pid": os.getpid(),
        "in_active_scene": True,
        "verification": {
            "exists": True,
            "exact_name_match": True,
            "type_match": True,
            "in_scene": True
        }
    }


def handle_inspect_scene(args):
    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    
    # 1. Bounded collections inspection
    collections = []
    seen_collections = set()
    raw_collections = list(bpy.data.collections) if hasattr(bpy.data, "collections") else []
    
    # Also include master scene collection if present
    if scene and hasattr(scene, "collection") and scene.collection:
        collections.append({
            "id": scene.collection.name,
            "name": scene.collection.name,
            "object_ids": [o.name for o in scene.collection.objects] if hasattr(scene.collection, "objects") else [],
            "visible": not scene.collection.hide_viewport if hasattr(scene.collection, "hide_viewport") else True
        })
        seen_collections.add(scene.collection.name)

    for col in raw_collections:
        if col.name not in seen_collections and len(collections) < 100:
            collections.append({
                "id": col.name,
                "name": col.name,
                "object_ids": [o.name for o in col.objects] if hasattr(col, "objects") else [],
                "visible": not col.hide_viewport if hasattr(col, "hide_viewport") else True
            })
            seen_collections.add(col.name)

    # 2. Bounded objects inspection
    raw_objects = list(scene.objects) if scene else list(bpy.data.objects)
    total_object_count = len(raw_objects)
    is_truncated = total_object_count > 500 or len(raw_collections) > 100
    
    objects = []
    active_obj = bpy.context.active_object if hasattr(bpy.context, "active_object") else None

    for obj in raw_objects[:500]:
        loc = [float(obj.location.x), float(obj.location.y), float(obj.location.z)]
        rot = [float(obj.rotation_euler.x), float(obj.rotation_euler.y), float(obj.rotation_euler.z)] if hasattr(obj, "rotation_euler") else [0.0, 0.0, 0.0]
        rot_mode = str(obj.rotation_mode) if hasattr(obj, "rotation_mode") else "XYZ"
        scale = [float(obj.scale.x), float(obj.scale.y), float(obj.scale.z)] if hasattr(obj, "scale") else [1.0, 1.0, 1.0]
        col_names = [c.name for c in obj.users_collection] if hasattr(obj, "users_collection") else []
        is_sel = bool(obj.select_get()) if hasattr(obj, "select_get") else False
        is_active = bool(active_obj == obj) if active_obj else False
        parent_name = obj.parent.name if hasattr(obj, "parent") and obj.parent else None

        objects.append({
            "id": obj.name,
            "name": obj.name,
            "type": obj.type,
            "location": loc,
            "rotation_euler": rot,
            "rotation_order": rot_mode,
            "scale": scale,
            "collection_names": col_names,
            "parent": parent_name,
            "visible": not obj.hide_viewport if hasattr(obj, "hide_viewport") else True,
            "selected": is_sel,
            "active": is_active
        })

    obj_names = [o["name"] for o in objects]
    filepath = bpy.data.filepath if hasattr(bpy.data, "filepath") else ""
    filename = os.path.basename(filepath) if filepath else ""
    is_dirty = bool(bpy.data.is_dirty) if hasattr(bpy.data, "is_dirty") else False

    return {
        "scene_name": scene.name if scene else "Unknown",
        "file_path": filepath,
        "file_name": filename,
        "is_dirty": is_dirty,
        "active_object_name": active_obj.name if active_obj else (objects[0]["name"] if objects else None),
        "blender_pid": os.getpid(),
        "object_count": total_object_count,
        "collection_count": len(collections),
        "is_truncated": is_truncated,
        "collections": collections,
        "objects": objects,
        "sentinels": {
            "Rezel_Test_Cube_001": "Rezel_Test_Cube_001" in obj_names,
            "Rezel_Test_Camera_001": "Rezel_Test_Camera_001" in obj_names
        }
    }



def handle_transform_object(args):
    obj_id = str(args.get("objectId") or args.get("object_id") or args.get("name") or "").strip()
    if not obj_id:
        raise ValueError("objectId is required for transform_object")

    obj = bpy.data.objects.get(obj_id)
    if obj is None:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    # 1. Location
    if "location" in args and args["location"] is not None:
        loc_raw = args["location"]
        if not isinstance(loc_raw, (list, tuple)) or len(loc_raw) != 3:
            raise ValueError("Location must be a 3-element numeric array [x, y, z]")
        loc = [float(x) for x in loc_raw]
        if any(not (isinstance(x, (int, float)) and math.isfinite(x)) for x in loc):
            raise ValueError("Location elements must be finite numbers")
        obj.location = tuple(loc)

    # 2. Rotation (Euler angles in radians)
    if "rotation" in args and args["rotation"] is not None:
        rot_raw = args["rotation"]
        if not isinstance(rot_raw, (list, tuple)) or len(rot_raw) != 3:
            raise ValueError("Rotation must be a 3-element numeric array [x, y, z] in radians")
        rot = [float(x) for x in rot_raw]
        if any(not (isinstance(x, (int, float)) and math.isfinite(x)) for x in rot):
            raise ValueError("Rotation elements must be finite numbers")
        obj.rotation_euler = tuple(rot)

    # 3. Rotation Mode
    if "rotationMode" in args and args["rotationMode"]:
        rot_mode = str(args["rotationMode"]).upper()
        if rot_mode not in ("XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX", "QUATERNION"):
            raise ValueError(f"Unsupported rotation mode '{rot_mode}'")
        obj.rotation_mode = rot_mode

    # 4. Scale
    if "scale" in args and args["scale"] is not None:
        scale_raw = args["scale"]
        if not isinstance(scale_raw, (list, tuple)) or len(scale_raw) != 3:
            raise ValueError("Scale must be a 3-element numeric array [x, y, z]")
        s = [float(x) for x in scale_raw]
        if any(not (isinstance(x, (int, float)) and math.isfinite(x)) for x in s):
            raise ValueError("Scale elements must be finite numbers")
        obj.scale = tuple(s)

    # Force view layer update
    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    # Read back resulting transform
    res_loc = [float(obj.location.x), float(obj.location.y), float(obj.location.z)]
    res_rot = [float(obj.rotation_euler.x), float(obj.rotation_euler.y), float(obj.rotation_euler.z)] if hasattr(obj, "rotation_euler") else [0.0, 0.0, 0.0]
    res_mode = str(obj.rotation_mode) if hasattr(obj, "rotation_mode") else "XYZ"
    res_scale = [float(obj.scale.x), float(obj.scale.y), float(obj.scale.z)] if hasattr(obj, "scale") else [1.0, 1.0, 1.0]

    return {
        "success": True,
        "id": obj.name,
        "name": obj.name,
        "type": obj.type,
        "location": res_loc,
        "rotation_euler": res_rot,
        "rotation_order": res_mode,
        "scale": res_scale,
        "blender_pid": os.getpid(),
        "verification": {
            "exists": True,
            "location": res_loc,
            "rotation_euler": res_rot,
            "scale": res_scale
        }
    }


def handle_rename_object(args):
    obj_id = str(args.get("objectId") or args.get("object_id") or args.get("name") or "").strip()
    new_name = str(args.get("newName") or args.get("new_name") or "").strip()

    if not obj_id:
        raise ValueError("objectId is required for rename_object")
    if not new_name:
        raise ValueError("newName is required for rename_object and cannot be empty")
    if len(new_name) > 64:
        raise ValueError("newName cannot exceed 64 characters")
    if any(ord(c) < 32 or ord(c) == 127 for c in new_name):
        raise ValueError("newName cannot contain control characters")

    obj = bpy.data.objects.get(obj_id)
    if obj is None:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    if new_name != obj_id:
        if new_name in bpy.data.objects:
            raise ValueError(f"An object named '{new_name}' already exists in Blender (cannot rename without ambiguity)")
        obj.name = new_name

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    verified_obj = bpy.data.objects.get(new_name)
    if verified_obj is None or verified_obj.name != new_name:
        return {
            "success": False,
            "error": f"Rename verification failed: expected '{new_name}', found '{getattr(verified_obj, 'name', None)}'",
            "verification": {"exists": verified_obj is not None, "exact_name_match": False}
        }

    return {
        "success": True,
        "id": verified_obj.name,
        "old_name": obj_id,
        "name": verified_obj.name,
        "type": verified_obj.type,
        "blender_pid": os.getpid(),
        "verification": {
            "exists": True,
            "exact_name_match": True
        }
    }


def handle_delete_object(args):
    obj_id = str(args.get("objectId") or args.get("object_id") or args.get("name") or "").strip()
    if not obj_id:
        raise ValueError("objectId is required for delete_object")

    obj = bpy.data.objects.get(obj_id)
    if obj is None:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    data_block = getattr(obj, "data", None)
    obj_type = getattr(obj, "type", None)

    # Remove object from scene and unlink
    bpy.data.objects.remove(obj, do_unlink=True)

    # Clean orphaned data block
    if data_block and getattr(data_block, "users", 0) == 0:
        if obj_type == "MESH" and hasattr(bpy.data, "meshes") and data_block.name in bpy.data.meshes:
            bpy.data.meshes.remove(data_block)
        elif obj_type == "CAMERA" and hasattr(bpy.data, "cameras") and data_block.name in bpy.data.cameras:
            bpy.data.cameras.remove(data_block)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    # Verify object no longer exists
    still_exists = bpy.data.objects.get(obj_id) is not None
    if still_exists:
        return {
            "success": False,
            "error": f"Delete verification failed: object '{obj_id}' still exists in bpy.data.objects",
            "verification": {"deleted": False, "exists": True}
        }

    return {
        "success": True,
        "deleted_object_id": obj_id,
        "blender_pid": os.getpid(),
        "verification": {
            "deleted": True,
            "exists": False
        }
    }



def handle_save_project(args):
    filepath = bpy.data.filepath
    if not filepath:
        raise ValueError("No file path associated with current Blender project. Use blender.project.save_as with an absolute path.")
    
    bpy.ops.wm.save_mainfile()
    
    return {
        "success": True,
        "file_path": filepath,
        "is_dirty": bool(bpy.data.is_dirty),
        "blender_pid": os.getpid(),
        "verification": {
            "exists": os.path.exists(filepath),
            "saved": True
        }
    }


def handle_save_as_project(args):
    filepath = str(args.get("filepath") or args.get("file_path") or "").strip()
    if not filepath:
        raise ValueError("filepath is required for save_as")
    if not os.path.isabs(filepath):
        raise ValueError("filepath must be an absolute path")
    if any(c in filepath for c in ['<', '>', '|', '*', '?', '"', '\0']):
        raise ValueError("filepath contains invalid or dangerous control characters")
    if ".." in filepath:
        raise ValueError("filepath cannot contain directory traversal '..'")

    parent_dir = os.path.dirname(filepath)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    bpy.ops.wm.save_as_mainfile(filepath=filepath)

    exists = os.path.exists(filepath)
    path_matches = (bpy.data.filepath == filepath or os.path.abspath(bpy.data.filepath) == os.path.abspath(filepath))

    if not exists:
        return {
            "success": False,
            "error": f"Save-As verification failed: File not found at '{filepath}' after save",
            "verification": {"exists": False}
        }

    return {
        "success": True,
        "file_path": bpy.data.filepath,
        "is_dirty": bool(bpy.data.is_dirty),
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "path_matches": path_matches
        }
    }


def handle_create_scene(args):
    name = str(args.get("name") or "").strip()
    if not name:
        raise ValueError("name is required for create_scene")
    if name in bpy.data.scenes:
        raise ValueError(f"Scene '{name}' already exists in Blender")

    scene = bpy.data.scenes.new(name=name)
    
    if bool(args.get("setActive", False)) or bool(args.get("set_active", False)):
        if hasattr(bpy.context, "window") and bpy.context.window:
            bpy.context.window.scene = scene
        elif hasattr(bpy.context, "screen") and bpy.context.screen:
            bpy.context.screen.scene = scene

    exists = scene.name in bpy.data.scenes
    return {
        "success": True,
        "name": scene.name,
        "is_active": (bpy.context.scene.name == scene.name) if bpy.context.scene else False,
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "exact_name_match": scene.name == name
        }
    }


def handle_switch_scene(args):
    name = str(args.get("sceneName") or args.get("name") or "").strip()
    if not name:
        raise ValueError("sceneName is required for switch_scene")

    scene = bpy.data.scenes.get(name)
    if not scene:
        raise ValueError(f"Scene '{name}' not found in bpy.data.scenes")

    if hasattr(bpy.context, "window") and bpy.context.window:
        bpy.context.window.scene = scene
    elif hasattr(bpy.context, "screen") and bpy.context.screen:
        bpy.context.screen.scene = scene

    active_name = bpy.context.scene.name if bpy.context.scene else None
    return {
        "success": True,
        "active_scene": active_name,
        "target_scene": name,
        "blender_pid": os.getpid(),
        "verification": {
            "is_active": active_name == name
        }
    }


def handle_create_collection(args):
    name = str(args.get("name") or "").strip()
    if not name:
        raise ValueError("name is required for create_collection")
    if name in bpy.data.collections:
        raise ValueError(f"Collection '{name}' already exists in Blender")

    col = bpy.data.collections.new(name=name)
    parent_name = args.get("parentCollection") or args.get("parent_collection")
    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)

    if parent_name:
        parent_col = bpy.data.collections.get(parent_name)
        if not parent_col:
            raise ValueError(f"Parent collection '{parent_name}' not found")
        parent_col.children.link(col)
    else:
        if scene:
            scene.collection.children.link(col)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    exists = col.name in bpy.data.collections
    return {
        "success": True,
        "name": col.name,
        "parent": parent_name or (scene.collection.name if scene else None),
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "exact_name_match": col.name == name
        }
    }


def handle_move_to_collection(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    target_name = str(args.get("targetCollection") or args.get("collection_name") or args.get("collection") or "").strip()
    unlink_others = bool(args.get("unlinkFromOthers", True))

    if not obj_id:
        raise ValueError("objectId is required for move_to_collection")
    if not target_name:
        raise ValueError("targetCollection is required for move_to_collection")

    obj = bpy.data.objects.get(obj_id)
    if not obj:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    target_col = bpy.data.collections.get(target_name)
    if not target_col and scene and (target_name == scene.collection.name or target_name in ("Master Collection", "Scene Collection")):
        target_col = scene.collection

    if not target_col:
        raise ValueError(f"Target collection '{target_name}' not found")

    if unlink_others:
        for c in list(obj.users_collection):
            if c != target_col:
                c.objects.unlink(obj)

    if obj.name not in target_col.objects:
        target_col.objects.link(obj)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    in_target = obj.name in target_col.objects
    return {
        "success": True,
        "objectId": obj.name,
        "targetCollection": target_col.name,
        "collections": [c.name for c in obj.users_collection],
        "blender_pid": os.getpid(),
        "verification": {
            "in_target_collection": in_target
        }
    }


def handle_duplicate_object(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    new_name = str(args.get("newName") or args.get("new_name") or "").strip()

    if not obj_id:
        raise ValueError("objectId is required for duplicate_object")

    obj = bpy.data.objects.get(obj_id)
    if not obj:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    if new_name and new_name in bpy.data.objects:
        raise ValueError(f"Object with name '{new_name}' already exists in Blender")

    new_obj = obj.copy()
    if obj.data:
        new_obj.data = obj.data.copy()

    if new_name:
        new_obj.name = new_name

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    target_col = obj.users_collection[0] if obj.users_collection else (scene.collection if scene else None)
    if target_col:
        target_col.objects.link(new_obj)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    verified_obj = bpy.data.objects.get(new_obj.name)
    exists = verified_obj is not None
    return {
        "success": True,
        "id": new_obj.name,
        "name": new_obj.name,
        "sourceObject": obj.name,
        "type": new_obj.type,
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "exact_name_match": (new_obj.name == new_name) if new_name else True
        }
    }


def handle_set_visibility(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    if not obj_id:
        raise ValueError("objectId is required for set_visibility")

    obj = bpy.data.objects.get(obj_id)
    if not obj:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    if "viewport" in args and args["viewport"] is not None:
        val = bool(args["viewport"])
        obj.hide_viewport = not val
        if hasattr(obj, "hide_set"):
            obj.hide_set(not val)

    if "render" in args and args["render"] is not None:
        val = bool(args["render"])
        obj.hide_render = not val

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    return {
        "success": True,
        "id": obj.name,
        "viewport": not obj.hide_viewport,
        "render": not obj.hide_render,
        "blender_pid": os.getpid(),
        "verification": {
            "exists": True,
            "viewport": not obj.hide_viewport,
            "render": not obj.hide_render
        }
    }


def handle_set_active(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    if not obj_id:
        raise ValueError("objectId is required for set_active")

    obj = bpy.data.objects.get(obj_id)
    if not obj:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if scene and obj.name not in scene.objects:
        raise ValueError(f"Object '{obj_id}' is not linked to the active scene '{scene.name}'")

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.objects.active = obj

    if bool(args.get("selected", True)) and hasattr(obj, "select_set"):
        obj.select_set(True)

    is_active = (bpy.context.active_object == obj) if hasattr(bpy.context, "active_object") else True
    return {
        "success": True,
        "id": obj.name,
        "name": obj.name,
        "isActive": is_active,
        "isSelected": bool(obj.select_get()) if hasattr(obj, "select_get") else True,
        "blender_pid": os.getpid(),
        "verification": {
            "is_active": is_active
        }
    }


def handle_create_empty(args):
    name = str(args.get("name", "Empty")).strip()
    empty_type = str(args.get("emptyType") or args.get("display_type") or "PLAIN_AXES").upper()
    loc_raw = args.get("location", [0, 0, 0])
    loc = tuple(float(x) for x in loc_raw) if isinstance(loc_raw, (list, tuple)) and len(loc_raw) == 3 else (0.0, 0.0, 0.0)

    if not name:
        raise ValueError("name is required for create_empty")
    if name in bpy.data.objects:
        raise ValueError(f"Object with name '{name}' already exists in Blender scene")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if not scene:
        raise RuntimeError("No active Blender scene available")

    obj = bpy.data.objects.new(name=name, object_data=None)
    obj.empty_display_type = empty_type
    obj.location = loc

    target_col = bpy.context.collection if bpy.context.collection else scene.collection
    target_col.objects.link(obj)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    verified_obj = bpy.data.objects.get(name)
    exists = verified_obj is not None and verified_obj.type == "EMPTY"
    return {
        "success": True,
        "name": obj.name,
        "type": "EMPTY",
        "empty_type": empty_type,
        "location": [float(obj.location.x), float(obj.location.y), float(obj.location.z)],
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "exact_name_match": obj.name == name,
            "type_match": obj.type == "EMPTY"
        }
    }


def handle_create_light(args):
    name = str(args.get("name", "Light")).strip()
    light_type = str(args.get("type", "POINT")).upper()
    if light_type not in ("POINT", "SUN", "SPOT", "AREA"):
        raise ValueError(f"Unsupported light type '{light_type}'. Allowed: POINT, SUN, SPOT, AREA")

    loc_raw = args.get("location", [0, 0, 0])
    loc = tuple(float(x) for x in loc_raw) if isinstance(loc_raw, (list, tuple)) and len(loc_raw) == 3 else (0.0, 0.0, 0.0)
    energy = float(args.get("energy", 10.0))
    color_raw = args.get("color", [1.0, 1.0, 1.0])
    color = tuple(float(x) for x in color_raw[:3]) if isinstance(color_raw, (list, tuple)) and len(color_raw) >= 3 else (1.0, 1.0, 1.0)

    if not name:
        raise ValueError("name is required for create_light")
    if name in bpy.data.objects:
        raise ValueError(f"Object with name '{name}' already exists in Blender scene")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if not scene:
        raise RuntimeError("No active Blender scene available")

    light_data = bpy.data.lights.new(name=f"{name}_data", type=light_type)
    light_data.energy = energy
    light_data.color = color

    obj = bpy.data.objects.new(name=name, object_data=light_data)
    obj.location = loc

    target_col = bpy.context.collection if bpy.context.collection else scene.collection
    target_col.objects.link(obj)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    verified_obj = bpy.data.objects.get(name)
    exists = verified_obj is not None and verified_obj.type == "LIGHT"
    return {
        "success": True,
        "name": obj.name,
        "type": "LIGHT",
        "light_type": light_type,
        "energy": energy,
        "color": list(color),
        "location": [float(obj.location.x), float(obj.location.y), float(obj.location.z)],
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "exact_name_match": obj.name == name,
            "type_match": obj.type == "LIGHT"
        }
    }


def handle_parent_object(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    parent_id = str(args.get("parentId") or args.get("parent_name") or args.get("parent") or "").strip()
    keep_transform = bool(args.get("keepTransform", True))

    if not obj_id:
        raise ValueError("objectId is required for parent_object")
    if not parent_id:
        raise ValueError("parentId is required for parent_object")
    if obj_id == parent_id:
        raise ValueError("Cannot parent an object to itself (cycle prevention)")

    child = bpy.data.objects.get(obj_id)
    if not child:
        raise ValueError(f"Child object '{obj_id}' not found in bpy.data.objects")

    parent = bpy.data.objects.get(parent_id)
    if not parent:
        raise ValueError(f"Parent object '{parent_id}' not found in bpy.data.objects")

    # Strict cycle prevention: traverse parent hierarchy
    curr = parent
    while curr:
        if curr == child or curr.name == child.name:
            raise ValueError(f"Parenting cycle detected: '{obj_id}' is already an ancestor of '{parent_id}'")
        curr = curr.parent

    if keep_transform:
        child.parent = parent
        child.matrix_parent_inverse = parent.matrix_world.inverted()
    else:
        child.parent = parent

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    parent_matches = child.parent == parent
    return {
        "success": True,
        "objectId": child.name,
        "parentId": parent.name,
        "parent": parent.name,
        "keepTransform": keep_transform,
        "blender_pid": os.getpid(),
        "verification": {
            "parent_matches": parent_matches,
            "parent_name": parent.name
        }
    }


def handle_unparent_object(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    keep_transform = bool(args.get("keepTransform", True))

    if not obj_id:
        raise ValueError("objectId is required for unparent_object")

    child = bpy.data.objects.get(obj_id)
    if not child:
        raise ValueError(f"Child object '{obj_id}' not found in bpy.data.objects")

    if keep_transform and child.parent:
        world_mat = child.matrix_world.copy()
        child.parent = None
        child.matrix_world = world_mat
    else:
        child.parent = None

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    return {
        "success": True,
        "objectId": child.name,
        "unparented": True,
        "blender_pid": os.getpid(),
        "verification": {
            "parent_is_none": child.parent is None
        }
    }


def handle_create_material(args):
    name = str(args.get("name", "Material")).strip()
    if not name:
        raise ValueError("name is required for create_material")
    if name in bpy.data.materials:
        raise ValueError(f"Material with name '{name}' already exists in Blender")

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True

    color_raw = args.get("color", [0.8, 0.8, 0.8, 1.0])
    if isinstance(color_raw, (list, tuple)) and len(color_raw) >= 3:
        r, g, b = float(color_raw[0]), float(color_raw[1]), float(color_raw[2])
        a = float(color_raw[3]) if len(color_raw) > 3 else 1.0
        mat.diffuse_color = (r, g, b, a)
        if mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    if "Base Color" in node.inputs:
                        node.inputs["Base Color"].default_value = (r, g, b, a)

    exists = mat.name in bpy.data.materials
    return {
        "success": True,
        "name": mat.name,
        "blender_pid": os.getpid(),
        "verification": {
            "exists": exists,
            "exact_name_match": mat.name == name
        }
    }


def handle_assign_material(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    mat_name = str(args.get("materialName") or args.get("material_name") or args.get("material") or "").strip()

    if not obj_id:
        raise ValueError("objectId is required for assign_material")
    if not mat_name:
        raise ValueError("materialName is required for assign_material")

    obj = bpy.data.objects.get(obj_id)
    if not obj:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    mat = bpy.data.materials.get(mat_name)
    if not mat:
        raise ValueError(f"Material '{mat_name}' not found in bpy.data.materials")

    if hasattr(obj, "data") and hasattr(obj.data, "materials"):
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    assigned_mats = [m.name for m in obj.data.materials if m] if (hasattr(obj, "data") and hasattr(obj.data, "materials")) else []
    assigned = mat.name in assigned_mats
    return {
        "success": True,
        "objectId": obj.name,
        "materialName": mat.name,
        "assignedMaterials": assigned_mats,
        "blender_pid": os.getpid(),
        "verification": {
            "assigned": assigned
        }
    }


def handle_set_material_color(args):
    mat_name = str(args.get("materialName") or args.get("name") or "").strip()
    if not mat_name:
        raise ValueError("materialName is required for set_material_color")

    mat = bpy.data.materials.get(mat_name)
    if not mat:
        raise ValueError(f"Material '{mat_name}' not found in bpy.data.materials")

    color_raw = args.get("color")
    if not isinstance(color_raw, (list, tuple)) or len(color_raw) < 3:
        raise ValueError("color must be a 3- or 4-element numeric array [r, g, b] or [r, g, b, a]")

    r, g, b = float(color_raw[0]), float(color_raw[1]), float(color_raw[2])
    a = float(color_raw[3]) if len(color_raw) > 3 else 1.0

    mat.diffuse_color = (r, g, b, a)
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                if "Base Color" in node.inputs:
                    node.inputs["Base Color"].default_value = (r, g, b, a)

    return {
        "success": True,
        "materialName": mat.name,
        "color": [r, g, b, a],
        "blender_pid": os.getpid(),
        "verification": {
            "color_set": True
        }
    }


def handle_insert_keyframe(args):
    obj_id = str(args.get("objectId") or args.get("name") or "").strip()
    prop = str(args.get("property", "location")).lower().strip()
    frame = int(args.get("frame", 1))

    if not obj_id:
        raise ValueError("objectId is required for insert_keyframe")
    if prop not in ("location", "rotation_euler", "scale"):
        raise ValueError(f"Property '{prop}' is unsupported (PROPERTY_UNSUPPORTED). Only location, rotation_euler, scale are supported.")

    obj = bpy.data.objects.get(obj_id)
    if not obj:
        raise ValueError(f"Object '{obj_id}' not found in bpy.data.objects")

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if scene:
        scene.frame_set(frame)

    if "value" in args and args["value"] is not None:
        val = args["value"]
        if isinstance(val, (list, tuple)) and len(val) == 3:
            setattr(obj, prop, tuple(float(x) for x in val))

    index = int(args.get("index", -1))
    inserted = obj.keyframe_insert(data_path=prop, frame=frame, index=index)

    if hasattr(bpy.context, "view_layer") and bpy.context.view_layer:
        bpy.context.view_layer.update()

    has_anim = obj.animation_data is not None and obj.animation_data.action is not None
    return {
        "success": True,
        "objectId": obj.name,
        "property": prop,
        "frame": frame,
        "keyframe_inserted": bool(inserted),
        "has_animation_data": has_anim,
        "blender_pid": os.getpid(),
        "verification": {
            "keyframe_exists": has_anim
        }
    }


def handle_render_image(args):
    output_path = str(args.get("outputPath") or args.get("output_path") or "").strip()
    if not output_path:
        raise ValueError("outputPath is required for render_image")
    if not os.path.isabs(output_path):
        raise ValueError("outputPath must be an absolute path")
    if any(c in output_path for c in ['<', '>', '|', '*', '?', '"', '\0']):
        raise ValueError("outputPath contains invalid or dangerous control characters")
    if ".." in output_path:
        raise ValueError("outputPath cannot contain directory traversal '..'")

    parent_dir = os.path.dirname(output_path)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    scene = bpy.context.scene if bpy.context.scene else (bpy.data.scenes[0] if bpy.data.scenes else None)
    if not scene:
        raise RuntimeError("No active Blender scene available for render")

    scene.render.filepath = output_path
    img_format = str(args.get("format", "PNG")).upper()
    if img_format in ("PNG", "JPEG", "OPEN_EXR", "TARGA", "BMP", "TIFF"):
        scene.render.image_settings.file_format = img_format

    if "frame" in args and args["frame"] is not None:
        scene.frame_set(int(args["frame"]))

    bpy.ops.render.render(write_still=True)

    final_path = output_path
    if not os.path.exists(final_path):
        for ext in ['.png', '.jpg', '.jpeg', '.exr', '.bmp', '.tga', '.tif']:
            if os.path.exists(output_path + ext):
                final_path = output_path + ext
                break

    file_exists = os.path.exists(final_path)
    file_size = os.path.getsize(final_path) if file_exists else 0

    if not file_exists:
        return {
            "success": False,
            "error": f"Render verification failed: output file not found at '{output_path}'",
            "verification": {"file_exists": False}
        }

    return {
        "success": True,
        "output_path": final_path,
        "file_size": file_size,
        "format": img_format,
        "blender_pid": os.getpid(),
        "verification": {
            "file_exists": True,
            "file_size": file_size
        }
    }


def handle_export_asset(args):
    output_path = str(args.get("outputPath") or args.get("output_path") or "").strip()
    fmt = str(args.get("format", "GLTF")).upper().strip()

    if not output_path:
        raise ValueError("outputPath is required for export_asset")
    if not os.path.isabs(output_path):
        raise ValueError("outputPath must be an absolute path")
    if any(c in output_path for c in ['<', '>', '|', '*', '?', '"', '\0']):
        raise ValueError("outputPath contains invalid or dangerous control characters")
    if ".." in output_path:
        raise ValueError("outputPath cannot contain directory traversal '..'")

    parent_dir = os.path.dirname(output_path)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    if fmt in ("GLTF", "GLB"):
        if hasattr(bpy.ops.export_scene, "gltf"):
            if output_path.lower().endswith(".glb") or fmt == "GLB":
                try:
                    bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLB")
                except Exception:
                    bpy.ops.export_scene.gltf(filepath=output_path)
            else:
                try:
                    bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLTF_SEPARATE")
                except Exception:
                    try:
                        bpy.ops.export_scene.gltf(filepath=output_path, export_format="GLTF_EMBEDDED")
                    except Exception:
                        bpy.ops.export_scene.gltf(filepath=output_path)
        else:
            raise RuntimeError("GLTF exporter operator not available in this Blender installation")
    elif fmt == "FBX":
        if hasattr(bpy.ops.export_scene, "fbx"):
            bpy.ops.export_scene.fbx(filepath=output_path)
        else:
            raise RuntimeError("FBX exporter operator not available in this Blender installation")
    elif fmt == "OBJ":
        if hasattr(bpy.ops.wm, "obj_export"):
            bpy.ops.wm.obj_export(filepath=output_path)
        elif hasattr(bpy.ops.export_scene, "obj"):
            bpy.ops.export_scene.obj(filepath=output_path)
        else:
            raise RuntimeError("OBJ exporter operator not available in this Blender installation")
    elif fmt == "STL":
        if hasattr(bpy.ops.wm, "stl_export"):
            bpy.ops.wm.stl_export(filepath=output_path)
        elif hasattr(bpy.ops.export_mesh, "stl"):
            bpy.ops.export_mesh.stl(filepath=output_path)
        else:
            raise RuntimeError("STL exporter operator not available in this Blender installation")
    else:
        raise ValueError(f"UNSUPPORTED_FORMAT: '{fmt}' is not a supported export format. Supported formats: GLTF, FBX, OBJ, STL.")

    actual_path = output_path
    file_exists = os.path.exists(actual_path)
    if not file_exists:
        if actual_path.lower().endswith(".gltf") and os.path.exists(actual_path[:-5] + ".glb"):
            actual_path = actual_path[:-5] + ".glb"
            file_exists = True
        elif actual_path.lower().endswith(".glb") and os.path.exists(actual_path[:-4] + ".gltf"):
            actual_path = actual_path[:-4] + ".gltf"
            file_exists = True

    file_size = os.path.getsize(actual_path) if file_exists else 0

    if not file_exists:
        return {
            "success": False,
            "error": f"Export verification failed: output file not found at '{output_path}'",
            "verification": {"file_exists": False}
        }

    return {
        "success": True,
        "output_path": actual_path,
        "file_size": file_size,
        "format": fmt,
        "blender_pid": os.getpid(),
        "verification": {
            "file_exists": True,
            "file_size": file_size
        }
    }


def handle_command(cmd, args):
    if cmd == "blender.inspect_scene":
        return handle_inspect_scene(args)
    elif cmd == "blender.create_object":
        return handle_create_object(args)
    elif cmd == "blender.create_camera":
        return handle_create_camera(args)
    elif cmd == "blender.create_empty":
        return handle_create_empty(args)
    elif cmd == "blender.create_light":
        return handle_create_light(args)
    elif cmd == "blender.transform_object":
        return handle_transform_object(args)
    elif cmd == "blender.rename_object":
        return handle_rename_object(args)
    elif cmd == "blender.delete_object":
        return handle_delete_object(args)
    elif cmd == "blender.project.save":
        return handle_save_project(args)
    elif cmd == "blender.project.save_as":
        return handle_save_as_project(args)
    elif cmd == "blender.scene.create":
        return handle_create_scene(args)
    elif cmd == "blender.scene.switch":
        return handle_switch_scene(args)
    elif cmd == "blender.collection.create":
        return handle_create_collection(args)
    elif cmd == "blender.object.move_to_collection":
        return handle_move_to_collection(args)
    elif cmd == "blender.object.duplicate":
        return handle_duplicate_object(args)
    elif cmd == "blender.object.set_visibility":
        return handle_set_visibility(args)
    elif cmd == "blender.object.set_active":
        return handle_set_active(args)
    elif cmd == "blender.object.parent":
        return handle_parent_object(args)
    elif cmd == "blender.object.unparent":
        return handle_unparent_object(args)
    elif cmd == "blender.material.create":
        return handle_create_material(args)
    elif cmd == "blender.material.assign":
        return handle_assign_material(args)
    elif cmd == "blender.material.set_color":
        return handle_set_material_color(args)
    elif cmd == "blender.animation.insert_keyframe":
        return handle_insert_keyframe(args)
    elif cmd == "blender.render.image":
        return handle_render_image(args)
    elif cmd == "blender.export.asset":
        return handle_export_asset(args)

    raise ValueError(f"Unknown command: {cmd}")


client = None

def timer_tick():
    global client
    if not client:
        return None
        
    try:
        msgs = client.recv_messages()
        if msgs is None:
            print("[Rezel IPC] Server connection closed. Stopping timer.")
            return None
            
        for msg in msgs:
            if msg.get("type") == "command":
                corr_id = msg.get("correlation_id")
                cmd = msg.get("command")
                args = msg.get("args", {})
                try:
                    res = handle_command(cmd, args)
                    client.send_json({
                        "type": "response",
                        "correlation_id": corr_id,
                        "success": True,
                        "result": res
                    })
                except Exception as e:
                    print(f"[Rezel IPC] Error handling {cmd}:", e)
                    client.send_json({
                        "type": "response",
                        "correlation_id": corr_id,
                        "success": False,
                        "error": str(e)
                    })
    except Exception as e:
        print("[Rezel IPC] Error in timer_tick loop:", e)
        
    return 0.1 # Keep timer alive every 100ms

if __name__ == "__main__":
    # blender --python script.py -- token host port launch_id
    args = sys.argv
    try:
        idx = args.index("--")
        token = args[idx+1]
        host = args[idx+2]
        port = int(args[idx+3])
        launch_id = args[idx+4]
        
        client = RezelWSClient(host, port, token, launch_id)
        bpy.app.timers.register(timer_tick)
        print(f"[Rezel IPC] Connected to {host}:{port} as pid={os.getpid()} launch_id={launch_id} and registered timer")
    except Exception as e:
        print("[Rezel IPC] Failed to initialize:", e)
