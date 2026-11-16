module Invidious::Feeds::Trending
  extend self

  def fetch(trending_type, region, locale)
    region ||= "US"
    region = region.upcase

    plid = nil

    case trending_type.try &.downcase
    when "gaming"
      browse_id = "UCOpNcN46UbXVtpKMrmU4Abg"
      params = "Egh0cmVuZGluZw%3D%3D"
    when "music"
      browse_id = "UC-9-kyTW8ZkZNDHQJ6FgpwQ"
      params = "Egh0cmVuZGluZw%3D%3D"
    when "livestreams"
      browse_id = "UC4R8DWoMoI7CAwX8_LjQHig"
      params = "EgdsaXZldGFikgEDCKEK"
    else
      # Default: YouTube Trending feed for region
      browse_id = "UC4R8DWoMoI7CAwX8_LjQHig"
      params = "EgdsaXZldGFikgEDCKEK"
    end

    client_config = YoutubeAPI::ClientConfig.new(region: region)
    initial_data = YoutubeAPI.browse(browse_id, params: params, client_config: client_config)

    items, _ = extract_items(initial_data)

    extracted = [] of SearchItem

    deduplicate = items.size > 1

    items.each do |itm|
      if itm.is_a?(Category)
        next if (itm.contents.size < 24 && deduplicate)
        extracted.concat itm.contents.select(SearchItem)
      else
        extracted << itm
      end
    end

    # Return clean videos (exclude livestreams in normal trending)
    if trending_type.try(&.downcase) == "livestreams"
      return extracted.select(SearchVideo | ProblematicTimelineItem).uniq!(&.id), plid
    else
      videos = extracted.select(SearchVideo).reject do |v|
        v.live_now || v.upcoming? || (v.premiere_timestamp.try &.> Time.utc)
      end
      return videos.uniq!(&.id), plid
    end
  end
end
