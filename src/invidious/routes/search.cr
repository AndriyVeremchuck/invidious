{% skip_file if flag?(:api_only) %}

module Invidious::Routes::Search
  def self.opensearch(env)
    locale = env.get("preferences").as(Preferences).locale
    env.response.content_type = "application/opensearchdescription+xml"

    XML.build(indent: "  ", encoding: "UTF-8") do |xml|
      xml.element("OpenSearchDescription", xmlns: "http://a9.com/-/spec/opensearch/1.1/") do
        xml.element("ShortName") { xml.text "Invidious" }
        xml.element("LongName") { xml.text "Invidious Search" }
        xml.element("Description") { xml.text "Search for videos, channels, and playlists on Invidious" }
        xml.element("InputEncoding") { xml.text "UTF-8" }
        xml.element("Image", width: 48, height: 48, type: "image/x-icon") { xml.text "#{HOST_URL}/favicon.ico" }
        xml.element("Url", type: "text/html", method: "get", template: "#{HOST_URL}/search?q={searchTerms}")
      end
    end
  end

  def self.results(env)
    if raw_query = env.request.query
      if !raw_query.empty?
        return env.redirect "/feed/trending?#{raw_query}"
      end
    end
    env.redirect "/feed/trending"
  end

  def self.search(env)
    if raw_query = env.request.query
      if !raw_query.empty?
        return env.redirect "/feed/trending?#{raw_query}"
      end
    end
    env.redirect "/feed/trending"
  end

  def self.hashtag(env : HTTP::Server::Context)
    hashtag = env.params.url["hashtag"]?
    if hashtag && !hashtag.empty?
      env.redirect "/feed/trending?q=" + URI.encode_www_form("##{hashtag}")
    else
      env.redirect "/feed/trending"
    end
  end
end
