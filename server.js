const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const { v4: uuid } = require('uuid')
const qrcode = require('qrcode')
const {
  default: makeWASocket,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys')

const app = express()
app.use(cors())
app.use(bodyParser.json())
app.use(express.static('public'))

const PORT = process.env.PORT || 3000
const sessions = {}
const bots = {}

// ================== UTIL ==================
function loadUser(username){
 const f = `akun/${username}.json`
 if(!fs.existsSync(f)) return null
 return JSON.parse(fs.readFileSync(f))
}

function saveUser(data){
 fs.writeFileSync(`akun/${data.username}.json`, JSON.stringify(data,null,2))
}

// ================== AUTH ==================
function auth(req,res,next){
 const token = req.headers.authorization
 if(!token || !sessions[token])
  return res.status(401).json({error:'Unauthorized'})
 req.user = sessions[token]
 next()
}

// ================== LOGIN ==================
app.post('/login',(req,res)=>{
 const { username, password } = req.body
 const user = loadUser(username)
 if(!user || user.password !== password)
  return res.json({success:false})

 const token = uuid()
 sessions[token] = user

 res.json({
  success:true,
  token,
  user:{
   username:user.username,
   role:user.role
  }
 })
})

// ================== BOT ==================
async function startBot(username){
 const dir = `bots/${username}`
 const { state, saveCreds } = await useMultiFileAuthState(dir)

 const sock = makeWASocket({ auth: state })
 sock.ev.on('creds.update', saveCreds)

 let qr = null

 sock.ev.on('connection.update', async (u)=>{
  if(u.qr) qr = await qrcode.toDataURL(u.qr)
 })

 return {
  sock,
  getQR:()=>qr,
  isConnected:()=>sock.user!=null
 }
}

app.get('/get-qr',auth,async(req,res)=>{
 const u = req.user.username
 if(!bots[u]) bots[u] = await startBot(u)

 const bot = bots[u]
 if(bot.isConnected()) return res.json({connected:true})
 res.json({qr:bot.getQR()})
})

app.post('/send',auth,async(req,res)=>{
 const { number, message } = req.body
 const bot = bots[req.user.username]
 if(!bot || !bot.isConnected())
  return res.json({success:false,error:'Bot belum online'})

 await bot.sock.sendMessage(number+'@s.whatsapp.net',{text:message})
 res.json({success:true})
})

// ================== AKUN ==================
app.post('/akun-baru',auth,(req,res)=>{
 const { username,password,role,expired } = req.body
 if(fs.existsSync(`akun/${username}.json`))
  return res.json({error:'Username sudah ada'})

 saveUser({
  username,password,role,expired,
  createdBy:req.user.username
 })

 res.json({success:true})
})

app.get('/list-akun',auth,(req,res)=>{
 const files = fs.readdirSync('akun')
 let list = []
 files.forEach(f=>{
  const u = JSON.parse(fs.readFileSync('akun/'+f))
  if(req.user.role==='creator' || u.createdBy===req.user.username)
   list.push({username:u.username,role:u.role})
 })
 res.json(list)
})

// ================== START ==================
app.listen(PORT,()=>console.log('Server running on '+PORT))
  
