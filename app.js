'use strict'

const cheerio = require('cheerio')
const eventproxy = require('eventproxy')
const mongoose = require('mongoose')
let request = require('request')

mongoose.connect('mongodb://localhost/test')
const Content = mongoose.model('Content', {
  title: String,
  company: String,
  homepage: String,
  overview: String,
  image: String
})

request = request.defaults({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.65 Safari/537.36'
  }
})

// 请求列表页面，对返回的数据进行清洗，得到 postUris
const fun1 = (pageUri) => {
  return new Promise((resolve, reject) => {
    request(pageUri, (err, res, body) => {
      if (err) return reject(err)
      if (!err && res.statusCode == 200) {
        let postUris = []
        let $ = cheerio.load(body)
        $('.inner_service_list > dl > .clearfix').each((idx, ele) => {
          let postUri = 'http://www.devstore.cn' + $(ele).find('.left_content > a').attr('href')
          postUris.push(postUri)
        })
        console.log('当前抓取的是 ' + pageUri.split('-')[5] + ' , 本页共有 ' + postUris.length + ' 个帖子')
        resolve(postUris)
      }
    })
  })
}

// 请求每个 postUri 发起，对返回数据进行清洗，获得 items
const fun2 = (postUris) => {
  return new Promise((resolve, reject) => {
    let ep = new eventproxy()
    ep.after('item', postUris.length, (items) => resolve(items))

    postUris.forEach((postUri) => {
      request(postUri, (err, res, body) => {
        if (err) return reject(err)
        if (!err && res.statusCode == 200) {
          let $ = cheerio.load(body)
          let item = {
            title: $('div.inner_service_de > div.service_de_section01 > div.service_de_section01_right > div.service_information > div.div01.clearfix > strong').text(),
            company: $('div.inner_service_de > div.service_de_section01 > div.service_de_section01_right > div.service_information > div.div02 > a').text(),
            homepage: $('div.inner_service_de > div.service_de_section01 > div.service_de_section01_right > div.service_information > div.div01.clearfix > a.enter_website').attr('href'),
            image: $('div.inner_service_de > div.service_de_section01 > div.service_de_section01_left > div.div02 > img').attr('src'),
          }
          request('http://www.devstore.cn/service/servicePara/' + postUri.split('/')[5], (serr, sres, sbody) => {
            if (serr) return reject(serr)
            if (!serr && res.statusCode == 200) {
              let $s = cheerio.load(sbody, {decodeEntities: false})
              item.overview = $s('div.inner_service_de > div.inner_service_de01 > div.service_review > div').html().replace(/[\r]/g, "").replace(/[\n]/g, "").replace(/\s/g, "")
              ep.emit('item', item)
            }
          })
        }
      })
    })
  })
}

// 对 items 数据进行保存处理
const fun3 = (items) => {
  items.forEach((item) => {
    Content.findOne({title: item.title}, (err, exist) => {
      if (err) {
        console.log(err)
        return
      }
      if (exist) {
        console.log('数据已存在')
      } else {
        let content = new Content(item)
        content.save((err) => {
          if (err) {
            console.log(err)
            return
          }
          console.log('帖子 + 1  =>  数据库')
        })
      }
    })
  })
}

let pageUris = []
for (let i = 1; i <= 94; i++) {
  pageUris.push('http://www.devstore.cn/service/newproductList/sta-cla0-cid-tag-ord-num' + i + '.html')
}

// 装入 pageUris ，每隔 1 分钟就发射一个 pageUri
let idx = 0
const len = pageUris.length
doNext()

function doNext() {
  let pageUri = pageUris[idx]
  idx++
  if (idx <= len) {
    Promise.resolve(pageUri)
      .then(fun1)
      .then(fun2)
      .then(fun3)
      .catch((err) => console.log(err))
    setTimeout(doNext, 60000)
  } else {
    console.log('即将结束！已发出全部请求')
    mongoose.disconnect()
  }
}
