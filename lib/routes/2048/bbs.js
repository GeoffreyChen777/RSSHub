const got = require('@/utils/got');
const cheerio = require('cheerio');

async function getAvailableHosts(ctx) {
    const fby_url = 'https://hjd.tw/';
    const cache_key = `2048gkd-${new Date().toLocaleDateString()}`;

    const cache = await ctx.cache.get(cache_key);
    if (cache) {
        return JSON.parse(cache);
    }

    const response = await got.get(fby_url);
    const $ = cheerio.load(response.data);
    const hosts = $('ul a')
        .map(function() {
            return $(this).attr('href');
        })
        .get();

    ctx.cache.set(cache_key, JSON.stringify(hosts));
    return hosts;
}

module.exports = async (ctx) => {
    const fid = ctx.params.fid;
    const base_hosts = await getAvailableHosts(ctx);

    const url = `${base_hosts[0]}/2048/thread.php?fid-${fid}-page-1.html`;

    const list_response = await got.get(url);
    const $ = cheerio.load(list_response.data);

    const list = $('.tr3.t_one').toArray();
    $('#breadCrumb span.fr').remove();
    const forum_name = $('#breadCrumb')
        .text()
        .replace(/»/g, '-');

    const parseContent = (htmlString) => {
        const $ = cheerio.load(htmlString);

        const time = $('.tiptop.cc > .fl.gray').attr('title');
        const content = $('.tpc_content');

        return {
            description: content.html(),
            pubDate: time ? new Date(time) : new Date(),
        };
    };

    const out = await Promise.all(
        list.slice(0, 30).map(async (item) => {
            const $ = cheerio.load(item);

            if (
                !$('td > a')
                    .first()
                    .attr('title')
            ) {
                return Promise.resolve('');
            }

            if ($("img[title='置顶帖标志']").length !== 0) {
                return Promise.resolve('');
            }

            const title = $('a.subject');
            const author = $('a.bl');
            const path = title.attr('href');

            const key = `/2048/${path}`;
            const link = `${base_hosts[0]}/2048/${path}`;

            const cache = await ctx.cache.get(key);
            if (cache) {
                return Promise.resolve(JSON.parse(cache));
            }

            const rssitem = {
                title: title.text().trim(),
                author: author.text().trim(),
                link: link,
                guid: key,
            };

            try {
                const response = await got.get(link);
                const result = parseContent(response.data);

                rssitem.description = result.description;
                rssitem.pubDate = result.pubDate;
            } catch (err) {
                return Promise.resolve('');
            }
            ctx.cache.set(key, JSON.stringify(rssitem));
            return Promise.resolve(rssitem);
        })
    );

    ctx.state.data = {
        title: forum_name,
        link: url,
        item: out.filter((item) => item !== ''),
    };
};
