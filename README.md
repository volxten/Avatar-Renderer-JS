# <center>Avatar Renderer JS</center>  
## <center>...Or ARJS for short.</center>   
<center>For rendering ROBLOX avatars **WITHOUT** RCC service!</center>  


## HOW TO SET UP

### Resources needed:
NodeJS  
A WebGL compatible device/browser
### NodeJS Packages:
express  
fs  
path  
gl  
gl-matrix  
pngjs  
...Or you can use this command to auto-install all of these:
`npm install express fs path gl gl-matrix pngjs`

## Running the project:
Open the project in a terminal *(root project folder to be more sepcific)*  
Run the command `node server.js`  
Go to `http://localhost:3000/` (you can change the port in ***line 7*** of server.js)  
and boom! you have a cool little avatar renderer!  

## Adding new assets
For *TShirts*, literally just place an image in `/publicAssets/tShirts/` ..yes thats it  
Same with *Faces*, but put them in `/publicAssets/faces/`  
For *Hats* it's a bit different: 
 1) Go to `/publicAssets/hatConfig/`, and create a NEW JSON file ***(do NOT copy and paste, it breaks it for some reason)***  
 2) Copy the ***file contents*** from any other hat, paste it in the new JSON, and change the values accordingly  
 3) Make sure you have the hat ***TEXTURES & MODEL*** in `/publicAssets/hatAssets` folder.  
 4) Link the hat assets accordingly in the JSON *(for example, mesh would be `./publicAssets/hatAssets/arrowhat.obj`)*  
 **PLEASE** make sure that your models are ***.OBJ***s, otherwise it will break the renderer.
